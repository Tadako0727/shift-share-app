begin;

alter table public.members
  add column if not exists active boolean not null default true;

create index if not exists members_active_idx on public.members(active);

create or replace function public.is_registered_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.members m
    where m.active
      and m.claimed_at is not null
      and (m.auth_user_id = auth.uid() or lower(m.email) = lower(coalesce(auth.jwt()->>'email','')))
  );
$$;

create or replace function public.current_member_profile()
returns table(id uuid, name text, display_name text, is_host boolean)
language sql
stable
security definer
set search_path = public
as $$
  select m.id, m.name, m.display_name, m.is_host
  from public.members m
  where m.active
    and m.claimed_at is not null
    and (m.auth_user_id = auth.uid() or lower(m.email) = lower(coalesce(auth.jwt()->>'email','')))
  limit 1;
$$;

create or replace function public.valid_member(p_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_registered_user()
    and exists (select 1 from public.members where id = p_id and active);
$$;

create or replace function public.get_registration_options(p_code text)
returns table(id uuid, name text, display_name text)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.store_access where access_code = p_code) then
    raise exception '店舗コードが違います';
  end if;
  return query
    select m.id, m.name, m.display_name
    from public.members m
    where m.active and m.claimed_at is null
    order by m.name;
end;
$$;

create or replace function public.claim_member(p_member_id uuid, p_code text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(coalesce(auth.jwt()->>'email',''));
begin
  if auth.uid() is null or v_email = '' then raise exception '認証が必要です'; end if;
  if not exists (select 1 from public.store_access where access_code = p_code) then raise exception '店舗コードが違います'; end if;
  if exists (select 1 from public.members where active and (auth_user_id = auth.uid() or lower(email) = v_email)) then raise exception 'このメールアドレスは登録済みです'; end if;
  update public.members
    set email = v_email, auth_user_id = auth.uid(), claimed_at = now()
    where id = p_member_id and active and claimed_at is null;
  if not found then raise exception 'この名前は既に登録済みか、削除されています'; end if;
end;
$$;

create or replace function public.current_user_is_host()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.members m
    where m.active and m.is_host and m.claimed_at is not null
      and (m.auth_user_id = auth.uid() or lower(m.email) = lower(coalesce(auth.jwt()->>'email','')))
  );
$$;

create or replace function public.host_add_member(p_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := btrim(p_name);
  v_id uuid;
begin
  if not public.current_user_is_host() then raise exception '管理者権限が必要です'; end if;
  if char_length(v_name) < 1 or char_length(v_name) > 30 then raise exception '名前は1〜30文字で入力してください'; end if;
  if exists (select 1 from public.members where active and lower(name) = lower(v_name)) then raise exception '同じ名前のメンバーがいます'; end if;
  insert into public.members(name, is_host, active) values (v_name, false, true) returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.host_disable_member(p_member_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.current_user_is_host() then raise exception '管理者権限が必要です'; end if;
  if exists (select 1 from public.members where id = p_member_id and is_host) then raise exception '管理者は削除できません'; end if;
  update public.members
    set active = false, email = null, auth_user_id = null, claimed_at = null
    where id = p_member_id and active;
  if not found then raise exception '対象のメンバーが見つかりません'; end if;
end;
$$;

revoke all on function public.current_user_is_host() from public, anon, authenticated;
revoke all on function public.host_add_member(text) from public, anon, authenticated;
revoke all on function public.host_disable_member(uuid) from public, anon, authenticated;
grant execute on function public.host_add_member(text) to authenticated;
grant execute on function public.host_disable_member(uuid) to authenticated;

commit;
