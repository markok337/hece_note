-- 0003: 냉장고 탭: 칸별 재료와 구매목록.
-- Supabase 웹 > SQL Editor 에 통째로 붙여 넣고 Run 한다. 여러 번 실행해도 안전하다.
-- 설계는 docs/decisions.md 의 "확정한 것: 냉장고" 참고.

-- 1. 재료. 앱이 id 와 created_at 을 직접 만들어 보낸다(화면을 먼저 바꾸고 서버에 나중에 쓰기 때문).
--    quantity 가 null 이면 "개수 없음"이다. 0 이하는 만들 수 없다.
create table if not exists public.fridge_items (
  id          uuid        primary key default gen_random_uuid(),
  compartment text        not null
                check (compartment in ('fridge_fresh', 'fridge_sauce', 'freezer_ingredient', 'freezer_mealkit')),
  name        text        not null check (char_length(btrim(name)) between 1 and 40),
  added_on    date        not null default current_date,
  quantity    integer     check (quantity is null or quantity between 1 and 999),
  created_at  timestamptz not null default now(),
  user_id     uuid        not null default auth.uid()
);

-- 칸 안에서 오래된 재료부터 읽는 순서.
create index if not exists fridge_items_order_idx
  on public.fridge_items (compartment, added_on, created_at);

-- 2. 구매목록. 체크한 항목은 목록 아래로 내려가고, 한 번에 지울 수 있다.
create table if not exists public.shopping_items (
  id          uuid        primary key default gen_random_uuid(),
  name        text        not null check (char_length(btrim(name)) between 1 and 40),
  checked     boolean     not null default false,
  created_at  timestamptz not null default now(),
  user_id     uuid        not null default auth.uid()
);

-- 3. 로그인한 본인 행만 읽고 쓴다.
alter table public.fridge_items enable row level security;
alter table public.shopping_items enable row level security;

drop policy if exists "owner_all" on public.fridge_items;
create policy "owner_all" on public.fridge_items
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "owner_all" on public.shopping_items;
create policy "owner_all" on public.shopping_items
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- 4. 다른 기기의 변경이 실시간으로 뜨도록 Realtime 에 등록한다.
do $$
declare
  t text;
begin
  foreach t in array array['fridge_items', 'shopping_items'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
