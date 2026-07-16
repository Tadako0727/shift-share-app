-- シフカレ Live: 店舗コードによる初回登録 + メールリンク認証
-- Supabase の SQL Editor で、このファイル全体を1回実行してください。

create extension if not exists pgcrypto;

-- 名前を先に用意し、初回登録時にメールと認証ユーザーを紐付けます。
alter table public.members alter column email drop not null;
alter table public.members add column if not exists auth_user_id uuid unique references auth.users(id) on delete set null;
alter table public.members add column if not exists claimed_at timestamptz;

-- すでに登録済みのメール（ホスト等）は、そのまま登録済みとして移行します。
update public.members m
set auth_user_id=u.id, claimed_at=coalesce(m.claimed_at,now())
from auth.users u
where m.email is not null
  and lower(m.email)=lower(u.email)
  and (m.auth_user_id is null or m.claimed_at is null);

update public.members
set claimed_at=coalesce(claimed_at,now())
where email is not null;

-- 店舗コードは平文で保存せず、ハッシュだけを保管します。
create table if not exists public.registration_settings(
  singleton boolean primary key default true check(singleton),
  code_hash bytea not null,
  created_at timestamptz not null default now()
);
alter table public.registration_settings enable row level security;
revoke all on public.registration_settings from public,anon,authenticated;

-- 古い版で履歴に保存していたメール列を削除します。
alter table public.shift_history drop column if exists actor_email;

create or replace function public.is_registered_user()
returns boolean language sql stable security definer set search_path=public
as $$
  select auth.uid() is not null
    and coalesce((auth.jwt()->>'is_anonymous')::boolean,false) is false
    and exists(
      select 1 from public.members m
      where m.claimed_at is not null
        and (m.auth_user_id=auth.uid()
          or lower(coalesce(m.email,''))=lower(coalesce(auth.jwt()->>'email','')))
    )
$$;

create or replace function public.current_member_profile()
returns table(id uuid,name text,display_name text,is_host boolean)
language sql stable security definer set search_path=public
as $$
  select m.id,m.name,m.display_name,m.is_host
  from public.members m
  where public.is_registered_user()
    and (m.auth_user_id=auth.uid()
      or lower(coalesce(m.email,''))=lower(coalesce(auth.jwt()->>'email','')))
  order by (m.auth_user_id=auth.uid()) desc
  limit 1
$$;

-- 正しい店舗コードを入力した場合だけ、未登録の名前を返します。
create or replace function public.get_registration_options(p_code text)
returns table(id uuid,name text,display_name text)
language plpgsql stable security definer set search_path=public,extensions
as $$
begin
  if not exists(
    select 1 from public.registration_settings
    where code_hash=digest(convert_to(btrim(p_code),'UTF8'),'sha256')
  ) then
    return;
  end if;
  return query
    select m.id,m.name,m.display_name
    from public.members m
    where m.claimed_at is null and m.auth_user_id is null and m.email is null
    order by m.name;
end $$;

-- メールリンクを開いた後、選んだ名前をその認証ユーザーへ一度だけ紐付けます。
create or replace function public.claim_member(p_member_id uuid,p_code text)
returns void language plpgsql security definer set search_path=public,extensions
as $$
declare v_email text:=lower(coalesce(auth.jwt()->>'email',''));
begin
  if auth.uid() is null
    or coalesce((auth.jwt()->>'is_anonymous')::boolean,false)
    or v_email='' then
    raise exception 'メール認証が必要です';
  end if;
  if not exists(
    select 1 from public.registration_settings
    where code_hash=digest(convert_to(btrim(p_code),'UTF8'),'sha256')
  ) then
    raise exception '店舗コードが違います';
  end if;
  if exists(select 1 from public.members where auth_user_id=auth.uid() or lower(coalesce(email,''))=v_email) then
    raise exception 'このメールアドレスは登録済みです';
  end if;

  update public.members
  set email=v_email,auth_user_id=auth.uid(),claimed_at=now()
  where id=p_member_id and claimed_at is null and auth_user_id is null and email is null;
  if not found then raise exception 'この名前はすでに登録されています'; end if;
end $$;

-- 登録済みメンバーだけが通常データを閲覧できます。
alter table public.members enable row level security;
alter table public.shifts enable row level security;
alter table public.shift_history enable row level security;
alter table public.closed_days enable row level security;

drop policy if exists "members_read_registered" on public.members;
drop policy if exists "members_read_authenticated" on public.members;
create policy "members_read_registered" on public.members for select to authenticated using(public.is_registered_user());
drop policy if exists "shifts_read_registered" on public.shifts;
drop policy if exists "shifts_read_authenticated" on public.shifts;
create policy "shifts_read_registered" on public.shifts for select to authenticated using(public.is_registered_user());
drop policy if exists "history_read_registered" on public.shift_history;
drop policy if exists "history_read_authenticated" on public.shift_history;
create policy "history_read_registered" on public.shift_history for select to authenticated using(public.is_registered_user());
drop policy if exists "closed_days_read_registered" on public.closed_days;
drop policy if exists "closed_days_read_authenticated" on public.closed_days;
create policy "closed_days_read_registered" on public.closed_days for select to authenticated using(public.is_registered_user());

-- メール等の認証情報はブラウザAPIから取得できません。
revoke select on public.members from anon,authenticated;
grant select(id,name,display_name,is_host,created_at) on public.members to authenticated;

create or replace function public.valid_member(p_id uuid)
returns boolean language sql stable security definer set search_path=public
as $$select public.is_registered_user() and exists(select 1 from public.members where id=p_id)$$;

revoke all on function public.get_registration_options(text) from public;
revoke all on function public.claim_member(uuid,text) from public;
revoke all on function public.is_registered_user() from public;
revoke all on function public.current_member_profile() from public;
revoke all on function public.valid_member(uuid) from public;
grant execute on function public.get_registration_options(text) to anon,authenticated;
grant execute on function public.claim_member(uuid,text) to authenticated;
grant execute on function public.is_registered_user() to authenticated;
grant execute on function public.current_member_profile() to authenticated;
grant execute on function public.valid_member(uuid) to authenticated;

-- 書き込みRPCは、登録済みユーザーだけが利用できます。
revoke execute on function public.set_display_name(uuid,text) from public,anon;
revoke execute on function public.create_shift(uuid,uuid,date,time,time) from public,anon;
revoke execute on function public.update_shift(uuid,uuid,uuid,date,time,time) from public,anon;
revoke execute on function public.delete_shift(uuid,uuid) from public,anon;
revoke execute on function public.bulk_replace_shifts(uuid,uuid,jsonb,boolean) from public,anon;
revoke execute on function public.set_closed_day(uuid,date,text) from public,anon;
revoke execute on function public.delete_closed_day(uuid,date) from public,anon;
grant execute on function public.set_display_name(uuid,text) to authenticated;
grant execute on function public.create_shift(uuid,uuid,date,time,time) to authenticated;
grant execute on function public.update_shift(uuid,uuid,uuid,date,time,time) to authenticated;
grant execute on function public.delete_shift(uuid,uuid) to authenticated;
grant execute on function public.bulk_replace_shifts(uuid,uuid,jsonb,boolean) to authenticated;
grant execute on function public.set_closed_day(uuid,date,text) to authenticated;
grant execute on function public.delete_closed_day(uuid,date) to authenticated;

-- 初回実行時だけ6桁の店舗コードを生成し、結果欄に表示します。
-- 表示されたコードを13人だけで共有してください。
with generated as(
  select lpad((floor(random()*1000000))::int::text,6,'0') as code
), inserted as(
  insert into public.registration_settings(singleton,code_hash)
  select true,digest(convert_to(code,'UTF8'),'sha256') from generated
  where not exists(select 1 from public.registration_settings)
  returning singleton
)
select code as registration_code from generated,inserted;
