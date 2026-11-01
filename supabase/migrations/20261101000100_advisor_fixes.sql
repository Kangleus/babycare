-- advisor：private.invite_attempts 加主键；显式写一条「谁都不能读写」的策略（只由 definer 函数访问）
alter table private.invite_attempts add column id bigint generated always as identity primary key;
create policy invite_attempts_none on private.invite_attempts for all to authenticated using (false) with check (false);
