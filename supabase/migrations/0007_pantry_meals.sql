-- 0007: 냉장고 탭에 "실온" 칸과 "식단"(날짜별 점심·저녁)을 더한다.
-- Supabase 웹 > SQL Editor 에 통째로 붙여 넣고 Run 한다. 여러 번 실행해도 안전하다.
-- 앱을 이 버전으로 열기 전에 먼저 실행한다. 실행하기 전에는 냉장고 탭이 "불러오기 실패"를 띄운다.

-- 1. 칸 선택지에 실온(pantry)을 넣는다. 0003 의 칸 목록 제약을 새 목록으로 바꾼다.
alter table public.fridge_items drop constraint if exists fridge_items_compartment_check;
alter table public.fridge_items
  add constraint fridge_items_compartment_check
  check (compartment in ('fridge_fresh', 'fridge_sauce', 'freezer_ingredient', 'freezer_mealkit', 'pantry'));

-- 2. 식단. 하루에 한 행이고, 점심·저녁이 모두 비면 앱이 행을 지운다. 냉장고 재료와는 이어지지 않는다.
create table if not exists public.meal_plans (
  day         date        not null,
  lunch       text        not null default '' check (char_length(btrim(lunch)) <= 40),
  dinner      text        not null default '' check (char_length(btrim(dinner)) <= 40),
  created_at  timestamptz not null default now(),
  user_id     uuid        not null default auth.uid(),
  primary key (user_id, day)
);

alter table public.meal_plans enable row level security;

drop policy if exists "owner_all" on public.meal_plans;
create policy "owner_all" on public.meal_plans
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- 3. 다른 기기의 변경이 실시간으로 뜨도록 Realtime 에 등록한다.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'meal_plans'
  ) then
    alter publication supabase_realtime add table public.meal_plans;
  end if;
end $$;
