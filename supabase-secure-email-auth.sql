-- ShiftCal: registered-email-only access migration
-- Run once in Supabase SQL Editor after deploying the matching app version.

-- Old versions recorded an actor email. The current app uses member IDs instead,
-- so remove the email-bearing column from the Data API entirely.
alter table public.shift_history drop column if exists actor_email;

create or replace function public.is_registered_user()
returns boolean
language sql
stable
security definer
set search_path=public
as $$
  select
    auth.uid() is not null
    and coalesce((auth.jwt()->>'is_anonymous')::boolean,false) is false
    and exists (
      select 1 from public.members
      where lower(email)=lower(coalesce(auth.jwt()->>'email',''))
    )
$$;

create or replace function public.current_member_profile()
returns table(id uuid,name text,display_name text,is_host boolean)
language sql
stable
security definer
set search_path=public
as $$
  select m.id,m.name,m.display_name,m.is_host
  from public.members m
  where public.is_registered_user()
    and lower(m.email)=lower(coalesce(auth.jwt()->>'email',''))
  limit 1
$$;

-- Existing write RPCs call this function for both the actor and target.
-- Requiring a registered permanent user here blocks anonymous callers while
-- retaining the requested ability for every member to edit every shift.
create or replace function public.valid_member(p_id uuid)
returns boolean
language sql
stable
security definer
set search_path=public
as $$
  select public.is_registered_user()
    and exists(select 1 from public.members where id=p_id)
$$;

alter table public.members enable row level security;
alter table public.shifts enable row level security;
alter table public.shift_history enable row level security;
alter table public.closed_days enable row level security;

drop policy if exists "members_read_registered" on public.members;
drop policy if exists "members_read_authenticated" on public.members;
create policy "members_read_registered" on public.members
for select to authenticated using (public.is_registered_user());

drop policy if exists "shifts_read_registered" on public.shifts;
drop policy if exists "shifts_read_authenticated" on public.shifts;
create policy "shifts_read_registered" on public.shifts
for select to authenticated using (public.is_registered_user());

drop policy if exists "history_read_registered" on public.shift_history;
drop policy if exists "history_read_authenticated" on public.shift_history;
create policy "history_read_registered" on public.shift_history
for select to authenticated using (public.is_registered_user());

drop policy if exists "closed_days_read_authenticated" on public.closed_days;
drop policy if exists "closed_days_read_registered" on public.closed_days;
create policy "closed_days_read_registered" on public.closed_days
for select to authenticated using (public.is_registered_user());

-- Email remains available to the security-definer functions above, but is not
-- selectable through the browser Data API, even by another registered member.
revoke select on public.members from anon,authenticated;
grant select(id,name,display_name,is_host,created_at) on public.members to authenticated;

revoke all on function public.is_registered_user() from public,anon;
revoke all on function public.current_member_profile() from public,anon;
revoke all on function public.valid_member(uuid) from public,anon;
grant execute on function public.is_registered_user() to authenticated;
grant execute on function public.current_member_profile() to authenticated;
grant execute on function public.valid_member(uuid) to authenticated;

-- Write RPCs remain available only to authenticated sessions. Each RPC calls
-- valid_member(), which now also requires a registered, non-anonymous email.
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
