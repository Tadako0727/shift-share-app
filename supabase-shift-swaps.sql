-- 本番用：シフト交代募集と回答を全メンバーで共有

create table if not exists public.swap_requests (
  id uuid primary key default gen_random_uuid(),
  shift_id uuid not null references public.shifts(id) on delete cascade,
  owner_id uuid not null references public.members(id) on delete cascade,
  scope text not null default 'both' check(scope in ('lunch','dinner','both','custom')),
  swap_start time,
  swap_end time,
  reason text not null default '',
  memo text not null default '',
  status text not null default 'open' check(status in ('open','confirmed')),
  approved_member_id uuid references public.members(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(scope<>'custom' or (swap_start is not null and swap_end is not null and swap_end>swap_start))
);

create unique index if not exists swap_requests_one_open_per_shift
on public.swap_requests(shift_id) where status='open';

create table if not exists public.swap_candidates (
  request_id uuid not null references public.swap_requests(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  response text not null default 'yes' check(response in ('eager','yes','maybe','no')),
  note text not null default '',
  available_date date,
  start_time time,
  end_time time,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(request_id,member_id),
  check(available_date is null or (start_time is not null and end_time is not null and end_time>start_time))
);

alter table public.swap_requests enable row level security;
alter table public.swap_candidates enable row level security;

drop policy if exists swap_requests_read on public.swap_requests;
drop policy if exists swap_requests_write on public.swap_requests;
drop policy if exists swap_candidates_read on public.swap_candidates;
drop policy if exists swap_candidates_write on public.swap_candidates;
create policy swap_requests_read on public.swap_requests for select to authenticated using(public.is_registered_user());
create policy swap_requests_write on public.swap_requests for all to authenticated using(public.is_registered_user()) with check(public.is_registered_user());
create policy swap_candidates_read on public.swap_candidates for select to authenticated using(public.is_registered_user());
create policy swap_candidates_write on public.swap_candidates for all to authenticated using(public.is_registered_user()) with check(public.is_registered_user());

grant select,insert,update,delete on public.swap_requests,public.swap_candidates to authenticated;

do $$ begin
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='swap_requests') then alter publication supabase_realtime add table public.swap_requests; end if;
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='swap_candidates') then alter publication supabase_realtime add table public.swap_candidates; end if;
end $$;
