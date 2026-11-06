-- New-member opt-in: anonymous Supabase Auth session can claim an unclaimed member.
-- Existing email/OTP onboarding and existing member rows remain unchanged.
create or replace function public.claim_anonymous_member(p_member_id uuid, p_code text)
returns void
language plpgsql security definer set search_path = ''
as $body$
begin
  if auth.uid() is null or coalesce((auth.jwt()->>'is_anonymous')::boolean, false) is not true then
    raise exception '端末登録には匿名認証が必要です';
  end if;
  if p_code is null or not exists (
    select 1 from public.registration_settings s
    where s.code_hash = extensions.digest(pg_catalog.btrim(p_code), 'sha256')
  ) then
    raise exception '店舗コードが違います';
  end if;
  if exists(select 1 from public.members where active and auth_user_id = auth.uid()) then
    raise exception 'この端末は登録済みです';
  end if;
  update public.members
     set auth_user_id = auth.uid(), claimed_at = pg_catalog.now()
   where id = p_member_id and active and claimed_at is null and is_host is not true;
  if not found then
    raise exception 'この名前は既に登録済みか、削除されています';
  end if;
end
$body$;

revoke all on function public.claim_anonymous_member(uuid,text) from public;
revoke all on function public.claim_anonymous_member(uuid,text) from anon;
grant execute on function public.claim_anonymous_member(uuid,text) to authenticated;
