-- 休業日対応（既存データは削除しません）
create table if not exists public.closed_days (
  closed_date date primary key,
  label text not null,
  kind text not null default 'temporary' check (kind in ('holiday','temporary')),
  created_by uuid references public.members(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.closed_days enable row level security;
drop policy if exists "closed_days_read_authenticated" on public.closed_days;
create policy "closed_days_read_authenticated" on public.closed_days for select to authenticated using (true);
revoke insert, update, delete on public.closed_days from authenticated;
grant select on public.closed_days to authenticated;

-- 内閣府公表の2026年・2027年の国民の祝日・休日
insert into public.closed_days (closed_date,label,kind) values
('2026-01-01','元日','holiday'),('2026-01-12','成人の日','holiday'),
('2026-02-11','建国記念の日','holiday'),('2026-02-23','天皇誕生日','holiday'),
('2026-03-20','春分の日','holiday'),('2026-04-29','昭和の日','holiday'),
('2026-05-03','憲法記念日','holiday'),('2026-05-04','みどりの日','holiday'),
('2026-05-05','こどもの日','holiday'),('2026-05-06','振替休日','holiday'),
('2026-07-20','海の日','holiday'),('2026-08-11','山の日','holiday'),
('2026-09-21','敬老の日','holiday'),('2026-09-22','休日','holiday'),
('2026-09-23','秋分の日','holiday'),('2026-10-12','スポーツの日','holiday'),
('2026-11-03','文化の日','holiday'),('2026-11-23','勤労感謝の日','holiday'),
('2027-01-01','元日','holiday'),('2027-01-11','成人の日','holiday'),
('2027-02-11','建国記念の日','holiday'),('2027-02-23','天皇誕生日','holiday'),
('2027-03-21','春分の日','holiday'),('2027-03-22','振替休日','holiday'),
('2027-04-29','昭和の日','holiday'),('2027-05-03','憲法記念日','holiday'),
('2027-05-04','みどりの日','holiday'),('2027-05-05','こどもの日','holiday'),
('2027-07-19','海の日','holiday'),('2027-08-11','山の日','holiday'),
('2027-09-20','敬老の日','holiday'),('2027-09-23','秋分の日','holiday'),
('2027-10-11','スポーツの日','holiday'),('2027-11-03','文化の日','holiday'),
('2027-11-23','勤労感謝の日','holiday')
on conflict (closed_date) do update set label=excluded.label,kind='holiday';

create or replace function public.set_closed_day(p_actor_member_id uuid,p_closed_date date,p_label text)
returns void language plpgsql security definer set search_path=public as $$
begin
  if not public.valid_member(p_actor_member_id) then raise exception 'メンバーを確認できません'; end if;
  if char_length(btrim(p_label)) not between 1 and 30 then raise exception '休業日の名前は1〜30文字で入力してください'; end if;
  if exists(select 1 from public.closed_days where closed_date=p_closed_date and kind='holiday') then raise exception '祝日は変更できません'; end if;
  insert into public.closed_days(closed_date,label,kind,created_by)
  values(p_closed_date,btrim(p_label),'temporary',p_actor_member_id)
  on conflict(closed_date) do update set label=excluded.label,created_by=excluded.created_by;
end $$;

create or replace function public.delete_closed_day(p_actor_member_id uuid,p_closed_date date)
returns void language plpgsql security definer set search_path=public as $$
begin
  if not public.valid_member(p_actor_member_id) then raise exception 'メンバーを確認できません'; end if;
  delete from public.closed_days where closed_date=p_closed_date and kind='temporary';
end $$;

grant execute on function public.set_closed_day(uuid,date,text) to authenticated;
grant execute on function public.delete_closed_day(uuid,date) to authenticated;

do $$ begin
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='closed_days') then
   alter publication supabase_realtime add table public.closed_days;
 end if;
end $$;
