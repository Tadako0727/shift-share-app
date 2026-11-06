-- Host-only recovery for email-free device registrations.
-- Preserve the member row, shifts, and history; revoke the old device mapping.
create or replace function public.host_device_member_ids()
returns setof uuid
language plpgsql stable security definer set search_path = ''
as $body$
begin
  if not public.current_user_is_host() then
    raise exception '管理者権限が必要です';
  end if;
  return query select m.id from public.members m
    where m.active and m.is_host is not true and m.email is null
      and m.claimed_at is not null and m.auth_user_id is not null;
end
$body$;

create or replace function public.host_reset_device_member(p_member_id uuid)
returns void language plpgsql security definer set search_path = ''
as $body$
begin
  if not public.current_user_is_host() then
    raise exception '管理者権限が必要です';
  end if;
  update public.members
     set auth_user_id = null, claimed_at = null
   where id = p_member_id and active and is_host is not true
     and email is null and claimed_at is not null and auth_user_id is not null;
  if not found then
    raise exception '再登録できる端末ユーザーが見つかりません';
  end if;
end
$body$;

revoke all on function public.host_device_member_ids() from public;
revoke all on function public.host_reset_device_member(uuid) from public;
grant execute on function public.host_device_member_ids() to authenticated;
grant execute on function public.host_reset_device_member(uuid) to authenticated;
