-- 一括貼り付けの置き換え範囲を、半月または月単位で自動判定する

create or replace function public.bulk_replace_shifts(p_actor_member_id uuid,p_target_member_id uuid,p_rows jsonb,p_replace boolean default true)
returns integer language plpgsql security definer set search_path=public as $$
declare r jsonb; old_v public.shifts; new_v public.shifts; v_name text; n int:=0;
begin
  if not public.valid_member(p_actor_member_id) or not public.valid_member(p_target_member_id) then raise exception 'メンバーを確認できません'; end if;
  if jsonb_array_length(p_rows)=0 then return 0; end if;
  if nullif(p_rows->0->>'replace_from','') is not null and
     nullif(p_rows->0->>'replace_to','') is not null and
     (p_rows->0->>'replace_from')::date>(p_rows->0->>'replace_to')::date then
    raise exception '置き換え期間の開始日と終了日を確認してください';
  end if;
  select name into v_name from public.members where id=p_target_member_id;
  if p_replace then
    for old_v in
      with pasted_dates as (
        select (x->>'shift_date')::date as shift_date from jsonb_array_elements(p_rows) x
      ), pasted_months as (
        select date_trunc('month',shift_date)::date as month_start,
               min(extract(day from shift_date))::int as first_day,
               max(extract(day from shift_date))::int as last_day
        from pasted_dates group by 1
      ), manual_range as (
        select nullif(p_rows->0->>'replace_from','')::date as range_start,
               nullif(p_rows->0->>'replace_to','')::date as range_end
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
      delete from public.shifts s using replace_ranges r
      where s.member_id=p_target_member_id and s.shift_date between r.range_start and r.range_end
      returning s.*
    loop
      insert into public.shift_history(action,actor_member_id,member_id,member_name,old_data)
      values('delete',p_actor_member_id,p_target_member_id,v_name,to_jsonb(old_v));
    end loop;
  end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    insert into public.shifts(member_id,shift_date,start_time,end_time)
    values(p_target_member_id,(r->>'shift_date')::date,(r->>'start_time')::time,(r->>'end_time')::time)
    returning * into new_v;
    insert into public.shift_history(action,actor_member_id,member_id,member_name,new_data)
    values('insert',p_actor_member_id,p_target_member_id,v_name,to_jsonb(new_v));
    n:=n+1;
  end loop;
  return n;
end $$;

revoke execute on function public.bulk_replace_shifts(uuid,uuid,jsonb,boolean) from public,anon;
grant execute on function public.bulk_replace_shifts(uuid,uuid,jsonb,boolean) to authenticated;
