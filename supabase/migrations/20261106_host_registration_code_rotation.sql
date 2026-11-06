-- Issue a fresh one-time-visible registration code for a verified host.
-- No member/Auth data is modified. Existing logins are unaffected.
create or replace function public.rotate_registration_code()
returns text
language plpgsql
security definer
set search_path = ''
as $body$
declare
  v_code text;
begin
  if auth.uid() is null or not exists (
    select 1 from public.members m
    where m.auth_user_id = auth.uid()
      and m.active is true
      and m.is_host is true
      and m.claimed_at is not null
  ) then
    raise exception '管理者権限が必要です';
  end if;

  -- 12 cryptographically random bytes = 96 bits; 24 uppercase hex characters.
  v_code := pg_catalog.upper(pg_catalog.encode(extensions.gen_random_bytes(12), 'hex'));

  update public.registration_settings
     set code_hash = extensions.digest(v_code, 'sha256')
   where singleton is true;
  if not found then
    raise exception '店舗コード設定が見つかりません';
  end if;
  return v_code;
end
$body$;

revoke all on function public.rotate_registration_code() from public;
revoke all on function public.rotate_registration_code() from anon;
grant execute on function public.rotate_registration_code() to authenticated;
