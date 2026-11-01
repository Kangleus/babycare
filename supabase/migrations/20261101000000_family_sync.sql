-- 一句记 M2：家庭共享 + 同步。所有表开启 RLS：只有家庭成员能读写本家庭数据。
-- SECURITY DEFINER 函数放在不对外暴露的 private schema；public 里只放 SECURITY INVOKER 的薄包装。

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

-- ---------- 表 ----------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text check (char_length(display_name) <= 20),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.families (
  id uuid primary key default gen_random_uuid(),
  name text not null default '我们家' check (char_length(name) between 1 and 30),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index families_created_by_idx on public.families (created_by);

create table public.family_members (
  family_id uuid not null references public.families(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('admin', 'member')),
  display_name text not null default '妈妈' check (char_length(display_name) between 1 and 12),
  joined_at timestamptz not null default now(),
  primary key (family_id, user_id)
);
create index family_members_user_idx on public.family_members (user_id);

create table public.babies (
  id text primary key check (char_length(id) between 4 and 64),
  family_id uuid not null references public.families(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 12),
  birthday date not null,
  gender text not null check (gender in ('girl', 'boy')),
  avatar text not null default 'baby' check (avatar in ('baby', 'sprout', 'flower', 'crown', 'cap', 'bottle')),
  feeding text not null default 'formula' check (feeding in ('formula', 'bm', 'breast')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index babies_family_idx on public.babies (family_id);

-- 记录：与本地 BabyRecord 一一对应（time→started_at, endTime→ended_at, values→vals）
create table public.records (
  id text primary key check (char_length(id) between 4 and 64),
  baby_id text not null references public.babies(id) on delete cascade,
  family_id uuid not null references public.families(id) on delete cascade,
  type text not null check (type in ('feed', 'sleep', 'diaper', 'water', 'med', 'temp', 'symptom', 'growth', 'bath')),
  started_at timestamptz not null,
  ended_at timestamptz,
  vals jsonb not null default '{}'::jsonb check (jsonb_typeof(vals) = 'object' and pg_column_size(vals) < 2000),
  note text check (char_length(note) <= 200),
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_by_name text not null default '妈妈' check (char_length(created_by_name) between 1 and 12),
  src text not null default 'manual' check (src in ('voice', 'manual')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index records_baby_updated_idx on public.records (baby_id, updated_at);
create index records_family_idx on public.records (family_id);
create index records_created_by_idx on public.records (created_by);

create table public.card_settings (
  baby_id text primary key references public.babies(id) on delete cascade,
  family_id uuid not null references public.families(id) on delete cascade,
  cards text[] not null check (cardinality(cards) between 1 and 12),
  updated_by uuid default auth.uid() references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
create index card_settings_family_idx on public.card_settings (family_id);
create index card_settings_updated_by_idx on public.card_settings (updated_by);

create table public.family_invites (
  code text primary key check (code ~ '^[A-Z0-9]{6}$'),
  family_id uuid not null references public.families(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  expires_at timestamptz not null,
  used_at timestamptz,
  used_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index family_invites_family_idx on public.family_invites (family_id);
create index family_invites_created_by_idx on public.family_invites (created_by);
create index family_invites_used_by_idx on public.family_invites (used_by);

-- 邀请码尝试次数（防暴力猜码），只在 private 里
create table private.invite_attempts (
  user_id uuid not null,
  at timestamptz not null default now()
);
create index invite_attempts_user_at_idx on private.invite_attempts (user_id, at);

-- ---------- 权限判断（definer，避免 family_members 的 RLS 递归） ----------
create or replace function private.is_member(fid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.family_members m where m.family_id = fid and m.user_id = (select auth.uid()));
$$;
create or replace function private.is_admin(fid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.family_members m where m.family_id = fid and m.user_id = (select auth.uid()) and m.role = 'admin');
$$;
revoke all on function private.is_member(uuid), private.is_admin(uuid) from public, anon;
grant execute on function private.is_member(uuid), private.is_admin(uuid) to authenticated;

-- ---------- 触发器 ----------
create or replace function private.touch() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end $$;

-- 记录：family_id 跟随宝宝；记录人 = 当前登录用户 + 其在家庭里的称呼；改记录不改记录人
create or replace function private.records_guard() returns trigger
language plpgsql set search_path = '' as $$
declare fid uuid;
begin
  select b.family_id into fid from public.babies b where b.id = new.baby_id;
  if fid is null then raise exception 'baby not found or not accessible' using errcode = '42501'; end if;
  new.family_id := fid;
  new.updated_at := now();
  if tg_op = 'INSERT' then
    new.created_by := (select auth.uid());
    new.created_by_name := coalesce(
      (select m.display_name from public.family_members m where m.family_id = fid and m.user_id = (select auth.uid())),
      new.created_by_name);
  else
    -- 记录人不可改；只允许外键 on delete set null（注销账号）把它置空
    if new.created_by is not null then new.created_by := old.created_by; end if;
    new.created_by_name := old.created_by_name;
    new.created_at := old.created_at;
  end if;
  return new;
end $$;

create or replace function private.cards_guard() returns trigger
language plpgsql set search_path = '' as $$
declare fid uuid;
begin
  select b.family_id into fid from public.babies b where b.id = new.baby_id;
  if fid is null then raise exception 'baby not found or not accessible' using errcode = '42501'; end if;
  new.family_id := fid; new.updated_at := now();
  -- 外键 on delete set null（注销账号）时保持为空，其余情况记为当前用户
  if not (tg_op = 'UPDATE' and new.updated_by is null and new.cards is not distinct from old.cards) then
    new.updated_by := (select auth.uid());
  end if;
  return new;
end $$;

-- 宝宝不能被挪到别的家庭
create or replace function private.babies_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then new.family_id := old.family_id; new.created_at := old.created_at; end if;
  new.updated_at := now();
  return new;
end $$;

create trigger profiles_touch before update on public.profiles for each row execute function private.touch();
create trigger records_guard before insert or update on public.records for each row execute function private.records_guard();
create trigger cards_guard before insert or update on public.card_settings for each row execute function private.cards_guard();
create trigger babies_guard before insert or update on public.babies for each row execute function private.babies_guard();
revoke all on function private.touch(), private.records_guard(), private.cards_guard(), private.babies_guard() from public, anon;
grant execute on function private.touch(), private.records_guard(), private.cards_guard(), private.babies_guard() to authenticated;

-- ---------- RLS ----------
alter table public.profiles enable row level security;
alter table public.families enable row level security;
alter table public.family_members enable row level security;
alter table public.babies enable row level security;
alter table public.records enable row level security;
alter table public.card_settings enable row level security;
alter table public.family_invites enable row level security;
alter table private.invite_attempts enable row level security;

-- 匿名角色不碰任何表
revoke all on public.profiles, public.families, public.family_members, public.babies, public.records, public.card_settings, public.family_invites from anon;
revoke all on private.invite_attempts from anon, authenticated;
-- 成员只能改自己的称呼（不能自封管理员）
revoke update on public.family_members from authenticated;
grant update (display_name) on public.family_members to authenticated;
-- 邀请只能通过 RPC 生成 / 使用
revoke insert, update, delete on public.family_invites from authenticated;
-- 家庭只能通过 RPC 创建
revoke insert, delete on public.families from authenticated;
revoke insert on public.family_members from authenticated;

create policy profiles_select on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy profiles_insert on public.profiles for insert to authenticated with check (id = (select auth.uid()));
create policy profiles_update on public.profiles for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy profiles_delete on public.profiles for delete to authenticated using (id = (select auth.uid()));

create policy families_select on public.families for select to authenticated using ((select private.is_member(id)));
create policy families_update on public.families for update to authenticated using ((select private.is_admin(id))) with check ((select private.is_admin(id)));

create policy members_select on public.family_members for select to authenticated using ((select private.is_member(family_id)));
create policy members_update on public.family_members for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy members_delete on public.family_members for delete to authenticated using (user_id = (select auth.uid()) or (select private.is_admin(family_id)));

create policy babies_select on public.babies for select to authenticated using ((select private.is_member(family_id)));
create policy babies_insert on public.babies for insert to authenticated with check ((select private.is_member(family_id)));
create policy babies_update on public.babies for update to authenticated using ((select private.is_member(family_id))) with check ((select private.is_member(family_id)));
create policy babies_delete on public.babies for delete to authenticated using ((select private.is_admin(family_id)));

create policy records_select on public.records for select to authenticated using ((select private.is_member(family_id)));
create policy records_insert on public.records for insert to authenticated with check ((select private.is_member(family_id)));
create policy records_update on public.records for update to authenticated using ((select private.is_member(family_id))) with check ((select private.is_member(family_id)));
create policy records_delete on public.records for delete to authenticated using ((select private.is_member(family_id)));

create policy cards_select on public.card_settings for select to authenticated using ((select private.is_member(family_id)));
create policy cards_insert on public.card_settings for insert to authenticated with check ((select private.is_member(family_id)));
create policy cards_update on public.card_settings for update to authenticated using ((select private.is_member(family_id))) with check ((select private.is_member(family_id)));

create policy invites_select on public.family_invites for select to authenticated using ((select private.is_member(family_id)));

-- ---------- RPC（definer 在 private，public 里是 invoker 包装） ----------
create or replace function private.create_family(p_name text, p_display_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare uid uuid := (select auth.uid()); fid uuid;
begin
  if uid is null then raise exception 'not signed in' using errcode = '42501'; end if;
  if (select count(*) from public.family_members m where m.user_id = uid) >= 5 then
    raise exception 'too many families' using errcode = '54000';
  end if;
  insert into public.profiles (id) values (uid) on conflict (id) do nothing;
  insert into public.families (name, created_by) values (coalesce(nullif(trim(p_name), ''), '我们家'), uid) returning id into fid;
  insert into public.family_members (family_id, user_id, role, display_name)
    values (fid, uid, 'admin', coalesce(nullif(trim(p_display_name), ''), '妈妈'));
  return fid;
end $$;

create or replace function private.create_invite(p_family uuid) returns table (code text, expires_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare uid uuid := (select auth.uid()); c text; abc constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; i int;
begin
  if uid is null or not exists (select 1 from public.family_members m where m.family_id = p_family and m.user_id = uid) then
    raise exception 'not a family member' using errcode = '42501';
  end if;
  if (select count(*) from public.family_invites f where f.family_id = p_family and f.used_at is null and f.expires_at > now()) >= 10 then
    raise exception 'too many active invites' using errcode = '54000';
  end if;
  loop
    c := '';
    for i in 1..6 loop c := c || substr(abc, 1 + floor(random() * length(abc))::int, 1); end loop;
    exit when not exists (select 1 from public.family_invites f where f.code = c);
  end loop;
  insert into public.family_invites (code, family_id, created_by, expires_at) values (c, p_family, uid, now() + interval '48 hours');
  return query select c, now() + interval '48 hours';
end $$;

-- 校验邀请码并加入；无效 / 过期 / 已用 返回 null（不抛错，以便记录尝试次数）
create or replace function private.accept_invite(p_code text, p_display_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare uid uuid := (select auth.uid()); inv public.family_invites; norm text := upper(trim(coalesce(p_code, '')));
begin
  if uid is null then raise exception 'not signed in' using errcode = '42501'; end if;
  if (select count(*) from private.invite_attempts a where a.user_id = uid and a.at > now() - interval '1 hour') >= 20 then
    raise exception 'too many attempts, try later' using errcode = '54000';
  end if;
  insert into private.invite_attempts (user_id) values (uid);
  select * into inv from public.family_invites f where f.code = norm for update;
  if not found or inv.used_at is not null or inv.expires_at <= now() then return null; end if;
  insert into public.profiles (id) values (uid) on conflict (id) do nothing;
  insert into public.family_members (family_id, user_id, role, display_name)
    values (inv.family_id, uid, 'member', coalesce(nullif(trim(p_display_name), ''), '家人'))
    on conflict (family_id, user_id) do update set display_name = excluded.display_name;
  update public.family_invites set used_at = now(), used_by = uid where code = inv.code;
  return inv.family_id;
end $$;

-- 注销：退出所有家庭（只剩自己的家庭整体删除，含宝宝和记录；还有其他成员的家庭保留记录、记录人显示名不变），删除资料和账号
create or replace function private.delete_account() returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := (select auth.uid()); f record;
begin
  if uid is null then raise exception 'not signed in' using errcode = '42501'; end if;
  for f in select m.family_id, m.role from public.family_members m where m.user_id = uid loop
    if (select count(*) from public.family_members x where x.family_id = f.family_id) = 1 then
      delete from public.families where id = f.family_id;
    elsif f.role = 'admin' and not exists (select 1 from public.family_members x where x.family_id = f.family_id and x.user_id <> uid and x.role = 'admin') then
      update public.family_members set role = 'admin'
        where (family_id, user_id) = (select x.family_id, x.user_id from public.family_members x where x.family_id = f.family_id and x.user_id <> uid order by x.joined_at limit 1);
    end if;
  end loop;
  delete from public.family_members where user_id = uid;
  delete from public.family_invites where created_by = uid and used_at is null;
  delete from private.invite_attempts where user_id = uid;
  delete from public.profiles where id = uid;
  delete from auth.users where id = uid;
end $$;

revoke all on function private.create_family(text, text), private.create_invite(uuid), private.accept_invite(text, text), private.delete_account() from public, anon;
grant execute on function private.create_family(text, text), private.create_invite(uuid), private.accept_invite(text, text), private.delete_account() to authenticated;

create or replace function public.create_family(p_name text, p_display_name text) returns uuid
language sql security invoker set search_path = '' as $$ select private.create_family(p_name, p_display_name) $$;
create or replace function public.create_invite(p_family uuid) returns table (code text, expires_at timestamptz)
language sql security invoker set search_path = '' as $$ select * from private.create_invite(p_family) $$;
create or replace function public.accept_invite(p_code text, p_display_name text) returns uuid
language sql security invoker set search_path = '' as $$ select private.accept_invite(p_code, p_display_name) $$;
create or replace function public.delete_account() returns void
language sql security invoker set search_path = '' as $$ select private.delete_account() $$;
revoke all on function public.create_family(text, text), public.create_invite(uuid), public.accept_invite(text, text), public.delete_account() from public, anon;
grant execute on function public.create_family(text, text), public.create_invite(uuid), public.accept_invite(text, text), public.delete_account() to authenticated;

-- ---------- Realtime：家人新增 / 修改记录实时推送（受 RLS 约束） ----------
alter publication supabase_realtime add table public.records;
