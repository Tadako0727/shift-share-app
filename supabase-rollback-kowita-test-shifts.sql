-- kowita51@gmail.com が日本時間の「昨日・今日」に行ったシフト変更だけを巻き戻します。
-- 他の利用者が後から同じシフトを変更している場合は、安全のためその履歴をスキップします。

create table if not exists public.shift_history_rollback_backup_20260722
as select * from public.shift_history where false;

insert into public.shift_history_rollback_backup_20260722
select h.*
from public.shift_history h
join public.members actor on actor.id=h.actor_member_id
where lower(actor.email)=lower('kowita51@gmail.com')
  and (h.created_at at time zone 'Asia/Tokyo')::date
      between date '2026-07-21' and date '2026-07-22'
  and not exists(
    select 1 from public.shift_history_rollback_backup_20260722 b where b.id=h.id
  );

do $$
declare
  h record;
  affected integer;
  reverted_ids bigint[] := '{}';
begin
  for h in
    select *
    from public.shift_history_rollback_backup_20260722
    order by created_at desc,id desc
  loop
    affected := 0;

    if h.action='insert' and h.new_data is not null then
      delete from public.shifts
      where id=(h.new_data->>'id')::uuid
        and member_id=(h.new_data->>'member_id')::uuid
        and shift_date=(h.new_data->>'shift_date')::date
        and start_time=(h.new_data->>'start_time')::time
        and end_time=(h.new_data->>'end_time')::time;
      get diagnostics affected = row_count;

    elsif h.action='update' and h.old_data is not null and h.new_data is not null then
      update public.shifts
      set member_id=(h.old_data->>'member_id')::uuid,
          shift_date=(h.old_data->>'shift_date')::date,
          start_time=(h.old_data->>'start_time')::time,
          end_time=(h.old_data->>'end_time')::time,
          updated_at=coalesce((h.old_data->>'updated_at')::timestamptz,now())
      where id=(h.new_data->>'id')::uuid
        and member_id=(h.new_data->>'member_id')::uuid
        and shift_date=(h.new_data->>'shift_date')::date
        and start_time=(h.new_data->>'start_time')::time
        and end_time=(h.new_data->>'end_time')::time;
      get diagnostics affected = row_count;

    elsif h.action='delete' and h.old_data is not null then
      insert into public.shifts(id,member_id,shift_date,start_time,end_time,created_at,updated_at)
      select (h.old_data->>'id')::uuid,
             (h.old_data->>'member_id')::uuid,
             (h.old_data->>'shift_date')::date,
             (h.old_data->>'start_time')::time,
             (h.old_data->>'end_time')::time,
             coalesce((h.old_data->>'created_at')::timestamptz,now()),
             coalesce((h.old_data->>'updated_at')::timestamptz,now())
      where not exists(select 1 from public.shifts s where s.id=(h.old_data->>'id')::uuid);
      get diagnostics affected = row_count;
    end if;

    if affected>0 then
      reverted_ids := array_append(reverted_ids,h.id);
    else
      raise notice '履歴ID % は現在値が変更後データと一致しないためスキップしました',h.id;
    end if;
  end loop;

  delete from public.shift_history where id=any(reverted_ids);
  raise notice '% 件の変更を巻き戻しました',coalesce(array_length(reverted_ids,1),0);
end $$;

-- 結果確認
select member_id,shift_date,start_time,end_time
from public.shifts
order by shift_date,start_time,member_id;
