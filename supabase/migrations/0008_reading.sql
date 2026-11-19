-- 독서 탭: 책과 메모, 책과 독립적인 날짜별 체크.
-- Supabase SQL Editor에서 실행한다. 반복 실행해도 안전하다.

create table if not exists public.reading_books (
  id uuid primary key default gen_random_uuid(),
  reader text not null check (reader in ('행이', '챙이')),
  title text not null check (char_length(btrim(title)) > 0),
  author text not null check (char_length(btrim(author)) > 0),
  start_day date not null,
  end_day date check (end_day is null or end_day >= start_day),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  user_id uuid not null default auth.uid()
);

create table if not exists public.reading_notes (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.reading_books(id) on delete cascade,
  page text not null check (char_length(btrim(page)) > 0),
  content text not null check (char_length(btrim(content)) > 0),
  position integer not null default 0,
  user_id uuid not null default auth.uid()
);

create table if not exists public.reading_days (
  day date primary key,
  haeng boolean not null default false,
  chaeng boolean not null default false,
  user_id uuid not null default auth.uid()
);

create index if not exists reading_books_dates_idx on public.reading_books(start_day, end_day);
create index if not exists reading_notes_book_idx on public.reading_notes(book_id, position);

alter table public.reading_books enable row level security;
alter table public.reading_notes enable row level security;
alter table public.reading_days enable row level security;

drop policy if exists "owner_all" on public.reading_books;
create policy "owner_all" on public.reading_books for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "owner_all" on public.reading_notes;
create policy "owner_all" on public.reading_notes for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and exists (
    select 1 from public.reading_books b where b.id = book_id and b.user_id = auth.uid()
  ));
drop policy if exists "owner_all" on public.reading_days;
create policy "owner_all" on public.reading_days for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and day <= current_date);

drop trigger if exists reading_books_touch on public.reading_books;
create trigger reading_books_touch before update on public.reading_books
  for each row execute function public.touch_updated_at();

do $$
declare t text;
begin
  foreach t in array array['reading_books', 'reading_notes', 'reading_days'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
