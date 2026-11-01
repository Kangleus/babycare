-- 集成测试收尾：删掉测试家庭和 yj-it-* 测试账号（identities 随 users 级联）
delete from public.families where id in (select m.family_id from public.family_members m join auth.users u on u.id = m.user_id where u.email like 'yj-it-%@example.com')
  or (not exists (select 1 from public.family_members m where m.family_id = families.id));
delete from auth.users where email like 'yj-it-%@example.com';
select (select count(*) from auth.users) users, (select count(*) from public.families) families, (select count(*) from public.babies) babies, (select count(*) from public.records) records, (select count(*) from public.family_invites) invites, (select count(*) from public.profiles) profiles;
