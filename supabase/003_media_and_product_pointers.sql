-- Cloud Sync Step 5/5: custom food images + product metadata pointers

create table if not exists public.food_images (
  user_id uuid not null references auth.users(id) on delete cascade,
  food_id text not null,
  image_url text not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, food_id)
);

create table if not exists public.product_pointers (
  user_id uuid not null references auth.users(id) on delete cascade,
  barcode text not null,
  product_name text not null default '',
  image_url text not null default '',
  source text not null default 'Open Food Facts',
  fetched_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, barcode)
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

drop trigger if exists trg_food_images_set_updated_at on public.food_images;
create trigger trg_food_images_set_updated_at
before update on public.food_images
for each row execute procedure public.set_updated_at();

drop trigger if exists trg_product_pointers_set_updated_at on public.product_pointers;
create trigger trg_product_pointers_set_updated_at
before update on public.product_pointers
for each row execute procedure public.set_updated_at();

alter table public.food_images enable row level security;
alter table public.product_pointers enable row level security;

drop policy if exists "food_images_select_own" on public.food_images;
create policy "food_images_select_own" on public.food_images
for select using (auth.uid() = user_id);

drop policy if exists "food_images_insert_own" on public.food_images;
create policy "food_images_insert_own" on public.food_images
for insert with check (auth.uid() = user_id);

drop policy if exists "food_images_update_own" on public.food_images;
create policy "food_images_update_own" on public.food_images
for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "food_images_delete_own" on public.food_images;
create policy "food_images_delete_own" on public.food_images
for delete using (auth.uid() = user_id);

drop policy if exists "product_pointers_select_own" on public.product_pointers;
create policy "product_pointers_select_own" on public.product_pointers
for select using (auth.uid() = user_id);

drop policy if exists "product_pointers_insert_own" on public.product_pointers;
create policy "product_pointers_insert_own" on public.product_pointers
for insert with check (auth.uid() = user_id);

drop policy if exists "product_pointers_update_own" on public.product_pointers;
create policy "product_pointers_update_own" on public.product_pointers
for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "product_pointers_delete_own" on public.product_pointers;
create policy "product_pointers_delete_own" on public.product_pointers
for delete using (auth.uid() = user_id);

-- Storage bucket + object policies (idempotent)
insert into storage.buckets (id, name, public)
values ('food-images', 'food-images', true)
on conflict (id) do nothing;

drop policy if exists "food_images_bucket_read" on storage.objects;
create policy "food_images_bucket_read" on storage.objects
for select using (bucket_id = 'food-images');

drop policy if exists "food_images_bucket_write_own" on storage.objects;
create policy "food_images_bucket_write_own" on storage.objects
for insert with check (
  bucket_id = 'food-images'
  and auth.uid()::text = (storage.foldername(name))[1]
);

drop policy if exists "food_images_bucket_update_own" on storage.objects;
create policy "food_images_bucket_update_own" on storage.objects
for update using (
  bucket_id = 'food-images'
  and auth.uid()::text = (storage.foldername(name))[1]
)
with check (
  bucket_id = 'food-images'
  and auth.uid()::text = (storage.foldername(name))[1]
);

drop policy if exists "food_images_bucket_delete_own" on storage.objects;
create policy "food_images_bucket_delete_own" on storage.objects
for delete using (
  bucket_id = 'food-images'
  and auth.uid()::text = (storage.foldername(name))[1]
);
