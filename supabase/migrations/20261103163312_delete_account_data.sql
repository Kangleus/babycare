-- 注销账号（delete-account Edge Function 的数据库部分）。
-- 和 20261101000000_family_sync.sql 里的 delete_account() 逻辑相同，区别：
--   1) 不在 SQL 里删 auth.users —— 账号由 Edge Function 用 service role 调 auth.admin.deleteUser 删除（Supabase 推荐的方式）；
--   2) 每个家庭先加行锁，避免两位家人同时注销时都以为「还有别人」，结果留下没人的家庭；
--   3) 返回计数（只有数字，不含任何个人信息），供函数日志使用。
-- 只能删「自己」：uid 取自 auth.uid()，不接受参数。可重复调用（第二次什么都不删）。
-- 旧的 delete_account() 保留（老版本 App 还在用）。
-- 已应用到线上库 2026-11-04（版本号与线上 supabase_migrations 一致）。

create or replace function private.delete_account_data() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  f record;
  n_deleted int := 0;
  n_left int := 0;
  n_promoted int := 0;
begin
  if uid is null then raise exception 'not signed in' using errcode = '42501'; end if;
  for f in
    select m.family_id, m.role from public.family_members m where m.user_id = uid order by m.family_id
  loop
    perform 1 from public.families x where x.id = f.family_id for update;
    if (select count(*) from public.family_members x where x.family_id = f.family_id) = 1 then
      -- 只有我一个人：整个家庭删除；宝宝、记录、健康档案、卡片、邀请码、AI 计数都随外键 on delete cascade 一起删
      delete from public.families where id = f.family_id;
      n_deleted := n_deleted + 1;
    else
      if f.role = 'admin' and not exists (
        select 1 from public.family_members x where x.family_id = f.family_id and x.user_id <> uid and x.role = 'admin'
      ) then
        -- 我是唯一的管理员：把最早加入的家人升为管理员
        update public.family_members set role = 'admin'
          where (family_id, user_id) = (
            select x.family_id, x.user_id from public.family_members x
            where x.family_id = f.family_id and x.user_id <> uid order by x.joined_at, x.user_id limit 1);
        n_promoted := n_promoted + 1;
      end if;
      delete from public.family_members where family_id = f.family_id and user_id = uid;
      n_left := n_left + 1;
    end if;
  end loop;
  -- 我生成但还没用的邀请码作废；尝试记录、个人资料删除。
  -- 留在家人那边的记录：created_by 会在删除 auth 用户时随外键置空，created_by_name（「妈妈记」）保留。
  delete from public.family_invites where created_by = uid and used_at is null;
  delete from private.invite_attempts where user_id = uid;
  delete from public.profiles where id = uid;
  return jsonb_build_object('families_deleted', n_deleted, 'families_left', n_left, 'admins_promoted', n_promoted);
end $$;

revoke all on function private.delete_account_data() from public, anon;
grant execute on function private.delete_account_data() to authenticated;

create or replace function public.delete_account_data() returns jsonb
language sql security invoker set search_path = '' as $$ select private.delete_account_data() $$;
revoke all on function public.delete_account_data() from public, anon;
grant execute on function public.delete_account_data() to authenticated;
