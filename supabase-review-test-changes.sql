-- 2026年7月22日に本番シフトへ加えられた変更の確認用（読み取りのみ）
-- このSQLはデータを変更・削除しません。
select
  id,
  created_at at time zone 'Asia/Tokyo' as changed_at_jst,
  action,
  member_name,
  coalesce(old_data->>'shift_date', new_data->>'shift_date') as shift_date,
  concat(old_data->>'start_time','〜',old_data->>'end_time') as before_time,
  concat(new_data->>'start_time','〜',new_data->>'end_time') as after_time
from public.shift_history
where created_at >= timestamptz '2026-07-22 00:00:00+09'
order by created_at desc;
