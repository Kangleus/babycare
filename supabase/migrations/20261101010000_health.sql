-- M4 健康：病程 / 过敏 / 疫苗接种记录 / 提醒事项。
-- 和 records 一样：id 用 App 本地 id（text），family_id 由触发器跟随宝宝，created_by = 当前用户（不能冒充），
-- updated_at / deleted_at 用于离线同步；RLS = 只有家庭成员能读写自己家庭的数据。

create table public.episodes (
  id text primary key check (length(id) between 4 and 64),
  baby_id text not null references public.babies (id) on delete cascade,
  family_id uuid not null references public.families (id) on delete cascade,
  title text not null check (length(title) between 1 and 40),
  start_date date not null,
  end_date date,
  status text not null default 'active' check (status in ('active', 'recovered')),
  visits jsonb not null default '[]'::jsonb check (jsonb_typeof(visits) = 'array' and pg_column_size(visits) < 8000),
  note text check (length(note) <= 200),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_by_name text not null default '妈妈' check (length(created_by_name) between 1 and 12),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (end_date is null or end_date >= start_date)
);

create table public.allergies (
  id text primary key check (length(id) between 4 and 64),
  baby_id text not null references public.babies (id) on delete cascade,
  family_id uuid not null references public.families (id) on delete cascade,
  name text not null check (length(name) between 1 and 30),
  note text check (length(note) <= 200),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_by_name text not null default '妈妈' check (length(created_by_name) between 1 and 12),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.vaccines (
  id text primary key check (length(id) between 4 and 64),
  baby_id text not null references public.babies (id) on delete cascade,
  family_id uuid not null references public.families (id) on delete cascade,
  name text not null check (length(name) between 1 and 30),
  given_on date not null,
  note text check (length(note) <= 200),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_by_name text not null default '妈妈' check (length(created_by_name) between 1 and 12),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.reminders (
  id text primary key check (length(id) between 4 and 64),
  baby_id text not null references public.babies (id) on delete cascade,
  family_id uuid not null references public.families (id) on delete cascade,
  cat text not null check (cat in ('med', 'visit', 'vax', 'check', 'temp')),
  title text not null check (length(title) between 1 and 40),
  due_at timestamptz not null,
  repeat text not null default 'none' check (repeat in ('none', 'daily', 'weekly')),
  note text check (length(note) <= 200),
  source text not null default 'user' check (source in ('user', 'plan', 'suggest')),
  plan_key text check (length(plan_key) <= 40),
  confirmed boolean not null default true,
  done_at timestamptz,
  done_by uuid references auth.users (id) on delete set null,
  done_by_name text check (length(done_by_name) <= 12),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_by_name text not null default '妈妈' check (length(created_by_name) between 1 and 12),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index episodes_baby_updated_idx on public.episodes (baby_id, updated_at);
create index episodes_family_idx on public.episodes (family_id);
create index episodes_created_by_idx on public.episodes (created_by);
create index allergies_baby_updated_idx on public.allergies (baby_id, updated_at);
create index allergies_family_idx on public.allergies (family_id);
create index allergies_created_by_idx on public.allergies (created_by);
create index vaccines_baby_updated_idx on public.vaccines (baby_id, updated_at);
create index vaccines_family_idx on public.vaccines (family_id);
create index vaccines_created_by_idx on public.vaccines (created_by);
create index reminders_baby_updated_idx on public.reminders (baby_id, updated_at);
create index reminders_family_idx on public.reminders (family_id);
create index reminders_created_by_idx on public.reminders (created_by);
create index reminders_done_by_idx on public.reminders (done_by);

-- 通用守卫：family_id 跟随宝宝；记录人 = 当前用户 + 家庭称呼；改的时候不能改记录人；允许外键置空（注销账号）
create or replace function private.health_guard() returns trigger
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
    if new.created_by is not null then new.created_by := old.created_by; end if;
    new.created_by_name := old.created_by_name;
    new.created_at := old.created_at;
  end if;
  return new;
end $$;

-- 提醒「谁完成的」由服务器按当前用户填写
create or replace function private.reminders_done() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.done_at is null then
    new.done_by := null; new.done_by_name := null;
  elsif tg_op = 'INSERT' or new.done_at is distinct from old.done_at then
    new.done_by := (select auth.uid());
    new.done_by_name := coalesce(
      (select m.display_name from public.family_members m where m.family_id = new.family_id and m.user_id = (select auth.uid())),
      new.done_by_name);
  elsif new.done_by is not null then
    new.done_by := old.done_by; new.done_by_name := old.done_by_name;
  else
    new.done_by_name := old.done_by_name;  -- 外键置空（注销账号）时保留称呼
  end if;
  return new;
end $$;

create trigger episodes_guard before insert or update on public.episodes for each row execute function private.health_guard();
create trigger allergies_guard before insert or update on public.allergies for each row execute function private.health_guard();
create trigger vaccines_guard before insert or update on public.vaccines for each row execute function private.health_guard();
create trigger reminders_guard before insert or update on public.reminders for each row execute function private.health_guard();
create trigger reminders_guard_done before insert or update on public.reminders for each row execute function private.reminders_done();
revoke all on function private.health_guard(), private.reminders_done() from public, anon;
grant execute on function private.health_guard(), private.reminders_done() to authenticated;

alter table public.episodes enable row level security;
alter table public.allergies enable row level security;
alter table public.vaccines enable row level security;
alter table public.reminders enable row level security;
revoke all on public.episodes, public.allergies, public.vaccines, public.reminders from anon;

create policy episodes_select on public.episodes for select to authenticated using ((select private.is_member(family_id)));
create policy episodes_insert on public.episodes for insert to authenticated with check ((select private.is_member(family_id)));
create policy episodes_update on public.episodes for update to authenticated using ((select private.is_member(family_id))) with check ((select private.is_member(family_id)));
create policy episodes_delete on public.episodes for delete to authenticated using ((select private.is_member(family_id)));

create policy allergies_select on public.allergies for select to authenticated using ((select private.is_member(family_id)));
create policy allergies_insert on public.allergies for insert to authenticated with check ((select private.is_member(family_id)));
create policy allergies_update on public.allergies for update to authenticated using ((select private.is_member(family_id))) with check ((select private.is_member(family_id)));
create policy allergies_delete on public.allergies for delete to authenticated using ((select private.is_member(family_id)));

create policy vaccines_select on public.vaccines for select to authenticated using ((select private.is_member(family_id)));
create policy vaccines_insert on public.vaccines for insert to authenticated with check ((select private.is_member(family_id)));
create policy vaccines_update on public.vaccines for update to authenticated using ((select private.is_member(family_id))) with check ((select private.is_member(family_id)));
create policy vaccines_delete on public.vaccines for delete to authenticated using ((select private.is_member(family_id)));

create policy reminders_select on public.reminders for select to authenticated using ((select private.is_member(family_id)));
create policy reminders_insert on public.reminders for insert to authenticated with check ((select private.is_member(family_id)));
create policy reminders_update on public.reminders for update to authenticated using ((select private.is_member(family_id))) with check ((select private.is_member(family_id)));
create policy reminders_delete on public.reminders for delete to authenticated using ((select private.is_member(family_id)));

alter publication supabase_realtime add table public.episodes, public.allergies, public.vaccines, public.reminders;
