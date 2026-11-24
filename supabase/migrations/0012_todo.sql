create table if not exists public.todo_items (
  id uuid primary key default gen_random_uuid(),
  content text not null check (char_length(btrim(content)) between 1 and 500),
  completed boolean not null default false,
  created_at timestamptz not null default now(),
  user_id uuid not null default auth.uid()
);

create index if not exists todo_items_order_idx on public.todo_items(user_id, created_at, id);

alter table public.todo_items enable row level security;
drop policy if exists "owner_all" on public.todo_items;
create policy "owner_all" on public.todo_items for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'todo_items'
  ) then
    alter publication supabase_realtime add table public.todo_items;
  end if;
end $$;
