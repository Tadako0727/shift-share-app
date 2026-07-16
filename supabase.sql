-- シフカレ v2 非破壊マイグレーション
-- 既存の members / shifts / shift_history の行は削除しません。
-- Supabase SQL Editor で全文を1回実行してください。

create extension if not exists pgcrypto;

alter table public.members add column if not exists display_name text;
update public.members set display_name = name where display_name is null or btrim(display_name) = '';
alter table public.shift_history add column if not exists actor_member_id uuid references public.members(id) on delete set null;

-- 名前選択方式でもブラウザごとに匿名Authセッションを持たせ、未セッションのDBアクセスを拒否します。
-- Dashboard > Authentication > Providers > Anonymous Sign-Ins を有効にしてください。
alter table public.members enable row level security;
alter table public.shifts enable row level security;
alter table public.shift_history enable row level security;

drop policy if exists "members_read_registered" on public.members;
drop policy if exists "members_insert_host" on public.members;
drop policy if exists "members_update_host" on public.members;
drop policy if exists "members_delete_host" on public.members;
drop policy if exists "members_read_authenticated" on public.members;
create policy "members_read_authenticated" on public.members for select to authenticated using (true);

drop policy if exists "shifts_read_registered" on public.shifts;
drop policy if exists "shifts_insert_registered" on public.shifts;
drop policy if exists "shifts_update_registered" on public.shifts;
drop policy if exists "shifts_delete_registered" on public.shifts;
drop policy if exists "shifts_read_authenticated" on public.shifts;
create policy "shifts_read_authenticated" on public.shifts for select to authenticated using (true);

drop policy if exists "history_read_registered" on public.shift_history;
drop policy if exists "history_read_authenticated" on public.shift_history;
create policy "history_read_authenticated" on public.shift_history for select to authenticated using (true);

-- 直接書込は許可せず、下記RPCだけに限定します。
revoke insert, update, delete on public.members, public.shifts, public.shift_history from authenticated;
grant select on public.members, public.shifts, public.shift_history to authenticated;

drop trigger if exists shifts_history_trigger on public.shifts;

create or replace function public.valid_member(p_id uuid) returns boolean language sql stable security definer set search_path=public as $$
  select auth.uid() is not null and exists(select 1 from public.members where id=p_id)
$$;
revoke all on function public.valid_member(uuid) from public;

create or replace function public.set_display_name(p_member_id uuid,p_display_name text) returns void language plpgsql security definer set search_path=public as $$
begin
  if not public.valid_member(p_member_id) then raise exception 'メンバーを確認できません'; end if;
  if char_length(btrim(p_display_name)) not between 1 and 24 then raise exception '表示名は1〜24文字で入力してください'; end if;
  update public.members set display_name=btrim(p_display_name) where id=p_member_id;
end $$;

create or replace function public.create_shift(p_actor_member_id uuid,p_target_member_id uuid,p_shift_date date,p_start_time time,p_end_time time) returns uuid language plpgsql security definer set search_path=public as $$
declare v public.shifts; v_name text;
begin
  if not public.valid_member(p_actor_member_id) or not public.valid_member(p_target_member_id) then raise exception 'メンバーを確認できません'; end if;
  if p_end_time<=p_start_time then raise exception '終了時間は開始時間より後にしてください'; end if;
  insert into public.shifts(member_id,shift_date,start_time,end_time) values(p_target_member_id,p_shift_date,p_start_time,p_end_time) returning * into v;
  select name into v_name from public.members where id=p_target_member_id;
  insert into public.shift_history(action,actor_member_id,member_id,member_name,new_data) values('insert',p_actor_member_id,p_target_member_id,v_name,to_jsonb(v));
  return v.id;
end $$;

create or replace function public.update_shift(p_shift_id uuid,p_actor_member_id uuid,p_target_member_id uuid,p_shift_date date,p_start_time time,p_end_time time) returns void language plpgsql security definer set search_path=public as $$
declare old_v public.shifts; new_v public.shifts; v_name text;
begin
  if not public.valid_member(p_actor_member_id) or not public.valid_member(p_target_member_id) then raise exception 'メンバーを確認できません'; end if;
  select * into old_v from public.shifts where id=p_shift_id; if old_v.id is null then raise exception 'シフトが見つかりません'; end if;
  if p_end_time<=p_start_time then raise exception '終了時間は開始時間より後にしてください'; end if;
  update public.shifts set member_id=p_target_member_id,shift_date=p_shift_date,start_time=p_start_time,end_time=p_end_time,updated_at=now() where id=p_shift_id returning * into new_v;
  select name into v_name from public.members where id=p_target_member_id;
  insert into public.shift_history(action,actor_member_id,member_id,member_name,old_data,new_data) values('update',p_actor_member_id,p_target_member_id,v_name,to_jsonb(old_v),to_jsonb(new_v));
end $$;

create or replace function public.delete_shift(p_shift_id uuid,p_actor_member_id uuid) returns void language plpgsql security definer set search_path=public as $$
declare old_v public.shifts; v_name text;
begin
  if not public.valid_member(p_actor_member_id) then raise exception 'メンバーを確認できません'; end if;
  delete from public.shifts where id=p_shift_id returning * into old_v; if old_v.id is null then raise exception 'シフトが見つかりません'; end if;
  select name into v_name from public.members where id=old_v.member_id;
  insert into public.shift_history(action,actor_member_id,member_id,member_name,old_data) values('delete',p_actor_member_id,old_v.member_id,v_name,to_jsonb(old_v));
end $$;

create or replace function public.bulk_replace_shifts(p_actor_member_id uuid,p_target_member_id uuid,p_rows jsonb,p_replace boolean default true) returns integer language plpgsql security definer set search_path=public as $$
declare r jsonb; old_v public.shifts; new_v public.shifts; v_name text; n int:=0;
begin
  if not public.valid_member(p_actor_member_id) or not public.valid_member(p_target_member_id) then raise exception 'メンバーを確認できません'; end if;
  select name into v_name from public.members where id=p_target_member_id;
  if p_replace then
    for old_v in delete from public.shifts where member_id=p_target_member_id and shift_date in (select (x->>'shift_date')::date from jsonb_array_elements(p_rows) x) returning * loop
      insert into public.shift_history(action,actor_member_id,member_id,member_name,old_data) values('delete',p_actor_member_id,p_target_member_id,v_name,to_jsonb(old_v));
    end loop;
  end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    insert into public.shifts(member_id,shift_date,start_time,end_time) values(p_target_member_id,(r->>'shift_date')::date,(r->>'start_time')::time,(r->>'end_time')::time) returning * into new_v;
    insert into public.shift_history(action,actor_member_id,member_id,member_name,new_data) values('insert',p_actor_member_id,p_target_member_id,v_name,to_jsonb(new_v)); n:=n+1;
  end loop; return n;
end $$;

grant execute on function public.valid_member(uuid) to authenticated;
grant execute on function public.set_display_name(uuid,text) to authenticated;
grant execute on function public.create_shift(uuid,uuid,date,time,time) to authenticated;
grant execute on function public.update_shift(uuid,uuid,uuid,date,time,time) to authenticated;
grant execute on function public.delete_shift(uuid,uuid) to authenticated;
grant execute on function public.bulk_replace_shifts(uuid,uuid,jsonb,boolean) to authenticated;

do $$ begin
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='shifts') then alter publication supabase_realtime add table public.shifts; end if;
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='members') then alter publication supabase_realtime add table public.members; end if;
end $$;
