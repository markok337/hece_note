-- 0002: 블로그 스케줄 달력: 날짜별 아이템과 분야 순환 규칙.
-- Supabase 웹 > SQL Editor 에 통째로 붙여 넣고 Run 한다. 여러 번 실행해도 안전하다.
-- 설계는 docs/decisions.md 의 "확정한 것: 블로그 스케줄 달력" 참고.

-- 1. 날짜별 아이템. 날짜가 기본키라 "하루 하나"가 DB에서도 보장된다.
--    행은 날짜를 처음 열거나 고칠 때 앱이 만든다. 분야는 항상 값이 있다(기본 순환 또는 수동/이동).
create table if not exists public.blog_days (
  day         date        primary key,
  category    text        not null
                check (category in ('레시피,제품', '뷰티', '맛집,여행')),
  assignee    text        check (assignee in ('행이', '챙이')),
  topic       text        check (topic is null or char_length(btrim(topic)) > 0),
  photo       boolean     not null default false,
  writing     boolean     not null default false,
  editing     boolean     not null default false,
  related     boolean     not null default false,
  reserved    boolean     not null default false,
  user_id     uuid        not null default auth.uid(),
  updated_at  timestamptz not null default now(),

  -- 잠금: 담당 → 주제 → 사진 → 글작성 → 글보정 → 연관글 → 예약.
  -- 앞 항목이 비어 있으면 뒤 항목은 값을 가질 수 없다.
  constraint blog_days_lock_topic    check (topic is null or assignee is not null),
  constraint blog_days_lock_photo    check (not photo    or topic is not null),
  constraint blog_days_lock_writing  check (not writing  or photo),
  constraint blog_days_lock_editing  check (not editing  or writing),
  constraint blog_days_lock_related  check (not related  or editing),
  constraint blog_days_lock_reserved check (not reserved or related)
);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists blog_days_touch on public.blog_days;
create trigger blog_days_touch
  before update on public.blog_days
  for each row execute function public.touch_updated_at();

-- 2. 분야 기본 순환 규칙 이력. effective_from 날짜부터 새 규칙을 쓴다.
--    어떤 날짜의 기본 분야 = 그 날짜 이하 중 가장 늦은 effective_from 의 규칙으로 계산한다.
--    계산: cycle[ ((day - anchor_day) mod 3 + 3) mod 3 + 1 ]  (anchor 이전 날짜도 같은 순서로 거슬러 계산)
create table if not exists public.blog_category_rules (
  effective_from date        primary key,
  anchor_day     date        not null,
  cycle          text[]      not null
                   check (cycle <@ array['레시피,제품', '뷰티', '맛집,여행']
                          and array_length(cycle, 1) between 1 and 3),
  user_id        uuid        not null default auth.uid()
);

-- 3. 로그인한 본인 행만 읽고 쓴다.
alter table public.blog_days enable row level security;
alter table public.blog_category_rules enable row level security;

drop policy if exists "owner_all" on public.blog_days;
create policy "owner_all" on public.blog_days
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "owner_all" on public.blog_category_rules;
create policy "owner_all" on public.blog_category_rules
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- 4. 날짜 이동. 두 행을 한 트랜잭션에서 바꿔야 해서 함수로 둔다.
--    - 도착 날짜에 주제가 있으면 막는다. 담당까지만 있으면 덮어쓴다.
--    - 분야도 따라간다. 떠난 날짜는 담당·주제·체크를 비우고 분야만 남긴다.
--    RLS 가 그대로 적용되도록 security invoker 로 둔다.
create or replace function public.move_blog_day(p_from date, p_to date)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  src public.blog_days;
  dst public.blog_days;
begin
  if p_from = p_to then
    return;
  end if;

  -- 항상 이른 날짜부터 잠가서 서로 반대로 옮기는 두 요청이 교착하지 않게 한다.
  perform 1 from public.blog_days
    where day in (p_from, p_to) order by day for update;

  select * into src from public.blog_days where day = p_from;
  if not found then
    raise exception '옮길 아이템이 없다: %', p_from using errcode = 'no_data_found';
  end if;

  select * into dst from public.blog_days where day = p_to;
  if found and dst.topic is not null then
    raise exception '도착 날짜에 주제가 있어 옮길 수 없다: %', p_to using errcode = 'check_violation';
  end if;

  insert into public.blog_days
    (day, category, assignee, topic, photo, writing, editing, related, reserved, user_id)
  values
    (p_to, src.category, src.assignee, src.topic, src.photo, src.writing,
     src.editing, src.related, src.reserved, auth.uid())
  on conflict (day) do update set
    category = excluded.category,
    assignee = excluded.assignee,
    topic    = excluded.topic,
    photo    = excluded.photo,
    writing  = excluded.writing,
    editing  = excluded.editing,
    related  = excluded.related,
    reserved = excluded.reserved;

  update public.blog_days
    set assignee = null, topic = null,
        photo = false, writing = false, editing = false, related = false, reserved = false
    where day = p_from;
end;
$$;

-- 5. 다른 기기의 변경이 실시간으로 뜨도록 Realtime 에 등록한다.
do $$
declare
  t text;
begin
  foreach t in array array['blog_days', 'blog_category_rules'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- 6. 최초 규칙: 11월 8일 = 레시피,제품 기준으로 3개 순환. 가장 이른 날짜부터 적용한다.
--    SQL Editor 에는 로그인 사용자가 없어서 auth.users 의 유일한 계정을 소유자로 넣는다.
insert into public.blog_category_rules (effective_from, anchor_day, cycle, user_id)
select date '1970-01-01', date '2026-11-08',
       array['레시피,제품', '뷰티', '맛집,여행'], u.id
from auth.users u
order by u.created_at
limit 1
on conflict (effective_from) do nothing;
