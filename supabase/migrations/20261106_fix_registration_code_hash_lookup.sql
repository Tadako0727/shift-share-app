-- Restore new-member registration using the existing SHA-256 code hash.
-- Non-destructive: does not change code hashes, members, or Auth users.
do $guard$
begin
  if (select count(*) from public.registration_settings) <> 1 then
    raise exception 'Expected exactly one registration_settings row';
  end if;
  if (select count(*) from public.registration_settings where octet_length(code_hash) = 32) <> 1 then
    raise exception 'Expected one 32-byte SHA-256 registration code hash';
  end if;
end
$guard$;

create or replace function public.get_registration_options(p_code text)
returns table(id uuid, name text, display_name text)
language plpgsql
security definer
set search_path = ''
as $body$
begin
  if p_code is null or not exists (
    select 1 from public.registration_settings s
    where s.code_hash = extensions.digest(pg_catalog.btrim(p_code), 'sha256')
  ) then
    raise exception '店舗コードが違います';
  end if;
  return query
    select m.id, m.name, m.display_name
    from public.members m
    where m.active and m.claimed_at is null
    order by m.name;
end
$body$;

create or replace function public.claim_member(p_member_id uuid, p_code text)
returns void
language plpgsql
security definer
set search_path = ''
as $body$
declare
  v_email text := pg_catalog.lower(pg_catalog.coalesce(auth.jwt()->>'email',''));
begin
  if auth.uid() is null or v_email = '' then raise exception '認証が必要です'; end if;
  if p_code is null or not exists (
    select 1 from public.registration_settings s
    where s.code_hash = extensions.digest(pg_catalog.btrim(p_code), 'sha256')
  ) then
    raise exception '店舗コードが違います';
  end if;
  if exists (
    select 1 from public.members
    where active and (auth_user_id = auth.uid() or pg_catalog.lower(email) = v_email)
  ) then
    raise exception 'このメールアドレスは登録済みです';
  end if;
  update public.members
    set email = v_email, auth_user_id = auth.uid(), claimed_at = pg_catalog.now()
    where id = p_member_id and active and claimed_at is null;
  if not found then raise exception 'この名前は既に登録済みか、削除されています'; end if;
end
$body$;

revoke all on function public.get_registration_options(text) from public;
grant execute on function public.get_registration_options(text) to anon, authenticated;
revoke all on function public.claim_member(uuid,text) from public;
grant execute on function public.claim_member(uuid,text) to authenticated;
