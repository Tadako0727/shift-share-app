-- 登録済みメンバー全員が、編集状態で祝日を含む休業日を変更できるようにする

create or replace function public.set_closed_day(p_actor_member_id uuid,p_closed_date date,p_label text)
returns void language plpgsql security definer set search_path=public as $$
begin
  if not public.valid_member(p_actor_member_id) then raise exception 'メンバーを確認できません'; end if;
  if char_length(btrim(p_label)) not between 1 and 30 then raise exception '休業日の名前は1〜30文字で入力してください'; end if;
  insert into public.closed_days(closed_date,label,kind,created_by)
  values(p_closed_date,btrim(p_label),'temporary',p_actor_member_id)
  on conflict(closed_date) do update
  set label=excluded.label,created_by=excluded.created_by;
end $$;

create or replace function public.delete_closed_day(p_actor_member_id uuid,p_closed_date date)
returns void language plpgsql security definer set search_path=public as $$
begin
  if not public.valid_member(p_actor_member_id) then raise exception 'メンバーを確認できません'; end if;
  delete from public.closed_days where closed_date=p_closed_date;
end $$;

revoke execute on function public.set_closed_day(uuid,date,text) from public,anon;
revoke execute on function public.delete_closed_day(uuid,date) from public,anon;
grant execute on function public.set_closed_day(uuid,date,text) to authenticated;
grant execute on function public.delete_closed_day(uuid,date) to authenticated;
