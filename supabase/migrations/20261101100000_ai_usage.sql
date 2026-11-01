-- 一句记 M3：AI 语音 / 问答每户每日计数（北京时间自然日）。只有 Edge Function 用「用户自己的 JWT」调用 public.bump_ai_usage；
-- 计数表在 private schema，不对外暴露；只能给自己所在家庭的宝宝计数。
create table if not exists private.ai_usage (
  family_id uuid not null references public.families(id) on delete cascade,
  day date not null,
  kind text not null check (kind in ('voice', 'ask')),
  n int not null default 0,
  primary key (family_id, day, kind)
);

create or replace function private.bump_ai_usage(p_baby text, p_kind text) returns int
language plpgsql security definer set search_path = '' as $$
declare fid uuid; uid uuid := (select auth.uid()); cnt int;
begin
  if uid is null then raise exception 'not signed in' using errcode = '42501'; end if;
  if p_kind not in ('voice', 'ask') then raise exception 'bad kind' using errcode = '22023'; end if;
  select b.family_id into fid from public.babies b where b.id = p_baby and b.deleted_at is null;
  if fid is null or not exists (select 1 from public.family_members m where m.family_id = fid and m.user_id = uid) then
    raise exception 'not a family member' using errcode = '42501';
  end if;
  insert into private.ai_usage as u (family_id, day, kind, n)
    values (fid, (now() at time zone 'Asia/Shanghai')::date, p_kind, 1)
  on conflict (family_id, day, kind) do update set n = u.n + 1
  returning u.n into cnt;
  return cnt;
end $$;
revoke all on function private.bump_ai_usage(text, text) from public, anon;
grant execute on function private.bump_ai_usage(text, text) to authenticated;

create or replace function public.bump_ai_usage(p_baby text, p_kind text) returns int
language sql security invoker set search_path = '' as $$ select private.bump_ai_usage(p_baby, p_kind) $$;
revoke all on function public.bump_ai_usage(text, text) from public, anon;
grant execute on function public.bump_ai_usage(text, text) to authenticated;
