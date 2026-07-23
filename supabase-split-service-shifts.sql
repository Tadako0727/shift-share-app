-- 通し勤務をランチ・ディナーの独立したシフトへ分割します。
-- Supabase SQL Editor で全文を1回実行してください。

do $$
begin
  insert into public.shifts(member_id,shift_date,start_time,end_time,created_at,updated_at)
  select member_id,shift_date,time '17:00',end_time,created_at,updated_at
  from public.shifts
  where start_time<time '15:00' and end_time>time '17:00';

  update public.shifts
  set end_time=time '15:00',updated_at=now()
  where start_time<time '15:00' and end_time>time '17:00';
end $$;

create or replace function public.insert_shift_parts(
  p_actor_member_id uuid,p_target_member_id uuid,p_shift_date date,
  p_start_time time,p_end_time time,p_member_name text
) returns uuid[] language plpgsql security definer set search_path=public as $$
declare v public.shifts; ids uuid[]:=array[]::uuid[];
begin
  if p_start_time<time '15:00' and p_end_time>time '17:00' then
    insert into public.shifts(member_id,shift_date,start_time,end_time)
    values(p_target_member_id,p_shift_date,p_start_time,time '15:00') returning * into v;
    insert into public.shift_history(action,actor_member_id,member_id,member_name,new_data)
    values('insert',p_actor_member_id,p_target_member_id,p_member_name,to_jsonb(v));
    ids:=array_append(ids,v.id);

    insert into public.shifts(member_id,shift_date,start_time,end_time)
    values(p_target_member_id,p_shift_date,time '17:00',p_end_time) returning * into v;
    insert into public.shift_history(action,actor_member_id,member_id,member_name,new_data)
    values('insert',p_actor_member_id,p_target_member_id,p_member_name,to_jsonb(v));
    ids:=array_append(ids,v.id);
  else
    insert into public.shifts(member_id,shift_date,start_time,end_time)
    values(p_target_member_id,p_shift_date,p_start_time,p_end_time) returning * into v;
    insert into public.shift_history(action,actor_member_id,member_id,member_name,new_data)
    values('insert',p_actor_member_id,p_target_member_id,p_member_name,to_jsonb(v));
    ids:=array_append(ids,v.id);
  end if;
  return ids;
end $$;

revoke execute on function public.insert_shift_parts(uuid,uuid,date,time,time,text) from public,anon,authenticated;

create or replace function public.create_shift(p_actor_member_id uuid,p_target_member_id uuid,p_shift_date date,p_start_time time,p_end_time time)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_name text; ids uuid[];
begin
  if not public.valid_member(p_actor_member_id) or not public.valid_member(p_target_member_id) then raise exception 'メンバーを確認できません'; end if;
  if p_end_time<=p_start_time then raise exception '終了時間は開始時間より後にしてください'; end if;
  select name into v_name from public.members where id=p_target_member_id;
  ids:=public.insert_shift_parts(p_actor_member_id,p_target_member_id,p_shift_date,p_start_time,p_end_time,v_name);
  return ids[1];
end $$;

create or replace function public.update_shift(p_shift_id uuid,p_actor_member_id uuid,p_target_member_id uuid,p_shift_date date,p_start_time time,p_end_time time)
returns void language plpgsql security definer set search_path=public as $$
declare old_v public.shifts; new_v public.shifts; v_name text; ids uuid[];
begin
  if not public.valid_member(p_actor_member_id) or not public.valid_member(p_target_member_id) then raise exception 'メンバーを確認できません'; end if;
  select * into old_v from public.shifts where id=p_shift_id; if old_v.id is null then raise exception 'シフトが見つかりません'; end if;
  if p_end_time<=p_start_time then raise exception '終了時間は開始時間より後にしてください'; end if;
  select name into v_name from public.members where id=p_target_member_id;
  if p_start_time<time '15:00' and p_end_time>time '17:00' then
    update public.shifts set member_id=p_target_member_id,shift_date=p_shift_date,start_time=p_start_time,end_time=time '15:00',updated_at=now()
    where id=p_shift_id returning * into new_v;
    insert into public.shift_history(action,actor_member_id,member_id,member_name,old_data,new_data)
    values('update',p_actor_member_id,p_target_member_id,v_name,to_jsonb(old_v),to_jsonb(new_v));
    ids:=public.insert_shift_parts(p_actor_member_id,p_target_member_id,p_shift_date,time '17:00',p_end_time,v_name);
  else
    update public.shifts set member_id=p_target_member_id,shift_date=p_shift_date,start_time=p_start_time,end_time=p_end_time,updated_at=now()
    where id=p_shift_id returning * into new_v;
    insert into public.shift_history(action,actor_member_id,member_id,member_name,old_data,new_data)
    values('update',p_actor_member_id,p_target_member_id,v_name,to_jsonb(old_v),to_jsonb(new_v));
  end if;
end $$;

create or replace function public.bulk_replace_shifts(p_actor_member_id uuid,p_target_member_id uuid,p_rows jsonb,p_replace boolean default true)
returns integer language plpgsql security definer set search_path=public as $$
declare r jsonb; old_v public.shifts; v_name text; n int:=0; ids uuid[];
begin
  if not public.valid_member(p_actor_member_id) or not public.valid_member(p_target_member_id) then raise exception 'メンバーを確認できません'; end if;
  if jsonb_array_length(p_rows)=0 then return 0; end if;
  if nullif(p_rows->0->>'replace_from','') is not null and nullif(p_rows->0->>'replace_to','') is not null
     and (p_rows->0->>'replace_from')::date>(p_rows->0->>'replace_to')::date then
    raise exception '置き換え期間の開始日と終了日を確認してください';
  end if;
  select name into v_name from public.members where id=p_target_member_id;
  if p_replace then
    for old_v in
      with pasted_dates as (
        select (x->>'shift_date')::date as shift_date from jsonb_array_elements(p_rows) x
      ), pasted_months as (
        select date_trunc('month',shift_date)::date as month_start,min(extract(day from shift_date))::int as first_day,
               max(extract(day from shift_date))::int as last_day from pasted_dates group by 1
      ), manual_range as (
        select nullif(p_rows->0->>'replace_from','')::date as range_start,nullif(p_rows->0->>'replace_to','')::date as range_end
      ), automatic_ranges as (
        select case when first_day>15 then month_start+15 else month_start end as range_start,
               case when last_day<=15 then month_start+14 else (month_start+interval '1 month'-interval '1 day')::date end as range_end
        from pasted_months
      ), replace_ranges as (
        select range_start,range_end from manual_range where range_start is not null and range_end is not null
        union all
        select range_start,range_end from automatic_ranges
        where not exists(select 1 from manual_range where range_start is not null and range_end is not null)
      )
      delete from public.shifts s using replace_ranges rr
      where s.member_id=p_target_member_id and s.shift_date between rr.range_start and rr.range_end returning s.*
    loop
      insert into public.shift_history(action,actor_member_id,member_id,member_name,old_data)
      values('delete',p_actor_member_id,p_target_member_id,v_name,to_jsonb(old_v));
    end loop;
  end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    ids:=public.insert_shift_parts(p_actor_member_id,p_target_member_id,(r->>'shift_date')::date,(r->>'start_time')::time,(r->>'end_time')::time,v_name);
    n:=n+cardinality(ids);
  end loop;
  return n;
end $$;

grant execute on function public.create_shift(uuid,uuid,date,time,time) to authenticated;
grant execute on function public.update_shift(uuid,uuid,uuid,date,time,time) to authenticated;
grant execute on function public.bulk_replace_shifts(uuid,uuid,jsonb,boolean) to authenticated;
