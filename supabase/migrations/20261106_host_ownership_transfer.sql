-- Only the current, authenticated host can transfer ownership to a registered member.
-- Existing data, sessions, shifts, and registration codes remain unchanged.
-- Host transfers are serialized to avoid simultaneous transfers.
create or replace function public.host_transfer_candidates()
returns setof uuid
language plpgsql stable security definer
set search_path = ''
as $body$
begin
  if auth.uid() is null or not exists (
    select 1 from public.members m
    where m.auth_user_id=auth.uid() and m.active and m.is_host
      and m.claimed_at is not null
  ) then
    raise exception '管理者権限が必要です';
  end if;
  return query select m.id from public.members m
    where m.active and m.is_host is not true
      and m.claimed_at is not null and m.auth_user_id is not null
    order by m.name;
end
$body$;

create or replace function public.host_transfer_ownership(p_target_member_id uuid)
returns void
language plpgsql volatile security definer
set search_path = ''
as $body$
declare
  v_host_id uuid;
  v_target_id uuid;
begin
  if auth.uid() is null then raise exception '認証が必要です'; end if;
  perform pg_catalog.pg_advisory_xact_lock(18442, 1);

  select m.id into v_host_id from public.members m
    where m.auth_user_id=auth.uid() and m.active and m.is_host
      and m.claimed_at is not null
    for update;
  if v_host_id is null then raise exception '管理者権限が必要です'; end if;

  if (select count(*) from public.members where active and is_host) <> 1 then
    raise exception '管理者の状態を確認できません。管理者に連絡してください';
  end if;
  select m.id into v_target_id from public.members m
    where m.id=p_target_member_id and m.active and m.is_host is not true
      and m.claimed_at is not null and m.auth_user_id is not null
    for update;
  if v_target_id is null then raise exception '譲渡先は登録済みのメンバーを選択してください'; end if;

  update public.members
    set is_host=(id=v_target_id)
    where id in (v_host_id,v_target_id);
  if not found then raise exception '権限譲渡に失敗しました'; end if;
end
$body$;

revoke all on function public.host_transfer_candidates() from public;
revoke all on function public.host_transfer_ownership(uuid) from public;
revoke all on function public.host_transfer_candidates() from anon;
revoke all on function public.host_transfer_ownership(uuid) from anon;
grant execute on function public.host_transfer_candidates() to authenticated;
grant execute on function public.host_transfer_ownership(uuid) to authenticated;
