-- Cloud Sync Step 3/5: profile-layer tables (persons + profile metadata)

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.persons (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  kcal_goal integer not null,
  macro_targets_json jsonb not null default '{}'::jsonb,
  habit_targets_json jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_persons_set_updated_at on public.persons;
create trigger trg_persons_set_updated_at
before update on public.persons
for each row execute procedure public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.persons enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
for select using (auth.uid() = user_id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles
for insert with check (auth.uid() = user_id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "profiles_delete_own" on public.profiles;
create policy "profiles_delete_own" on public.profiles
for delete using (auth.uid() = user_id);

drop policy if exists "persons_select_own" on public.persons;
create policy "persons_select_own" on public.persons
for select using (auth.uid() = user_id);

drop policy if exists "persons_insert_own" on public.persons;
create policy "persons_insert_own" on public.persons
for insert with check (auth.uid() = user_id);

drop policy if exists "persons_update_own" on public.persons;
create policy "persons_update_own" on public.persons
for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "persons_delete_own" on public.persons;
create policy "persons_delete_own" on public.persons
for delete using (auth.uid() = user_id);
