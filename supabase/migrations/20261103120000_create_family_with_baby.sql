-- 首次使用流程（docs/ONBOARDING-FLOW.md §7 待定 2）：「新建宝宝」= 建家庭 + 我成为管理员 + 建宝宝，一个事务里完成。
-- 以前是 create_family 之后客户端再 upsert babies，中途断网会出现「有家庭、没宝宝」。
-- 约定和 create_family 一致：definer 放 private，public 里只放 invoker 薄包装；只给 authenticated 执行。
-- 旧的 create_family 保留（老版本 App 还在用）。
-- ⚠️ 只写文件待审核，不要直接应用到线上库。

create or replace function private.create_family_with_baby(p_name text, p_display_name text, p_baby jsonb)
returns table (family_id uuid, baby_id text)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare
  uid uuid := (select auth.uid());
  fid uuid;
  b_id text;
  b_name text;
  b_bd date;
  b_gender text;
  b_avatar text;
  b_feeding text;
  fam_name text := coalesce(nullif(trim(p_name), ''), '我们家');
  disp text := coalesce(nullif(trim(p_display_name), ''), '妈妈');
begin
  if uid is null then raise exception 'not signed in' using errcode = '42501'; end if;
  if (select count(*) from public.family_members m where m.user_id = uid) >= 5 then
    raise exception 'too many families' using errcode = '54000';
  end if;

  -- ---------- 校验（和表上的 check 约束、客户端 ProfileForm 保持一致） ----------
  if p_baby is null or jsonb_typeof(p_baby) <> 'object' then
    raise exception 'bad baby' using errcode = '22023';
  end if;
  if char_length(fam_name) > 30 then raise exception 'bad family name' using errcode = '22023'; end if;
  if char_length(disp) > 12 then raise exception 'bad display name' using errcode = '22023'; end if;

  b_id := p_baby ->> 'id';
  if b_id is null or char_length(b_id) not between 4 and 64 then
    raise exception 'bad baby id' using errcode = '22023';
  end if;
  b_name := trim(coalesce(p_baby ->> 'name', ''));
  if char_length(b_name) not between 1 and 12 then
    raise exception 'bad baby name' using errcode = '22023';
  end if;
  if coalesce(p_baby ->> 'birthday', '') !~ '^\d{4}-\d{2}-\d{2}$' then
    raise exception 'bad birthday' using errcode = '22023';
  end if;
  begin
    b_bd := (p_baby ->> 'birthday')::date;
  exception when others then
    raise exception 'bad birthday' using errcode = '22023';
  end;
  -- 「不晚于今天」：按最东的时区（UTC+14）算今天，避免东边时区的用户在当地今天被误拒
  if b_bd > (now() at time zone 'Pacific/Kiritimati')::date or b_bd < date '2000-01-01' then
    raise exception 'bad birthday' using errcode = '22023';
  end if;
  b_gender := coalesce(p_baby ->> 'gender', 'girl');
  if b_gender not in ('girl', 'boy') then raise exception 'bad gender' using errcode = '22023'; end if;
  b_avatar := coalesce(p_baby ->> 'avatar', 'baby');
  if b_avatar not in ('baby', 'sprout', 'flower', 'crown', 'cap', 'bottle') then
    raise exception 'bad avatar' using errcode = '22023';
  end if;
  b_feeding := coalesce(p_baby ->> 'feeding', 'formula');
  if b_feeding not in ('formula', 'bm', 'breast') then raise exception 'bad feeding' using errcode = '22023'; end if;

  -- ---------- 一个事务：资料 → 家庭 → 我是管理员 → 宝宝 ----------
  insert into public.profiles (id) values (uid) on conflict (id) do nothing;
  insert into public.families (name, created_by) values (fam_name, uid) returning id into fid;
  insert into public.family_members (family_id, user_id, role, display_name) values (fid, uid, 'admin', disp);
  insert into public.babies (id, family_id, name, birthday, gender, avatar, feeding)
    values (b_id, fid, b_name, b_bd, b_gender, b_avatar, b_feeding);

  return query select fid, b_id;
end $$;

revoke all on function private.create_family_with_baby(text, text, jsonb) from public, anon;
grant execute on function private.create_family_with_baby(text, text, jsonb) to authenticated;

create or replace function public.create_family_with_baby(p_name text, p_display_name text, p_baby jsonb)
returns table (family_id uuid, baby_id text)
language sql security invoker set search_path = '' as $$ select * from private.create_family_with_baby(p_name, p_display_name, p_baby) $$;
revoke all on function public.create_family_with_baby(text, text, jsonb) from public, anon;
grant execute on function public.create_family_with_baby(text, text, jsonb) to authenticated;
