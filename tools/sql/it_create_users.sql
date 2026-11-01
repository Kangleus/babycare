-- 集成测试账号（测试结束后删除）
with u as (
  select gen_random_uuid() id, e from unnest(array['yj-it-a@example.com','yj-it-b@example.com','yj-it-c@example.com']) e
  where not exists (select 1 from auth.users x where x.email = e)
), ins as (
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token)
  select '00000000-0000-0000-0000-000000000000', id, 'authenticated', 'authenticated', e, extensions.crypt('__PASSWORD_FROM_.env.test__', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''
  from u returning id, email
)
insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), id, id::text, jsonb_build_object('sub', id::text, 'email', email, 'email_verified', true), 'email', now(), now(), now() from ins
returning user_id;
