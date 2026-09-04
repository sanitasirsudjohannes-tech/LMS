-- 020_training_reviews.sql
create table if not exists public.training_reviews (
  id uuid primary key default gen_random_uuid(),
  training_id uuid not null references public.trainings(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  material_rating smallint not null check (material_rating between 1 and 5),
  material_ease_rating smallint not null check (material_ease_rating between 1 and 5),
  relevance_rating smallint not null check (relevance_rating between 1 and 5),
  speaker_rating smallint not null check (speaker_rating between 1 and 5),
  suggestion text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (training_id, user_id)
);

alter table public.training_reviews enable row level security;

drop policy if exists "participants read own training reviews" on public.training_reviews;
create policy "participants read own training reviews"
on public.training_reviews for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "participants insert own training reviews" on public.training_reviews;
create policy "participants insert own training reviews"
on public.training_reviews for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "participants update own training reviews" on public.training_reviews;
create policy "participants update own training reviews"
on public.training_reviews for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "admin read all training reviews" on public.training_reviews;
create policy "admin read all training reviews"
on public.training_reviews for select
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  )
);

create index if not exists training_reviews_training_id_idx
on public.training_reviews(training_id);
