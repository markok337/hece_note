-- 0004: 가계부 탭: 지출 항목, 분류, 예산 규칙, 카드, 확인한 문자.
-- Supabase 웹 > SQL Editor 에 통째로 붙여 넣고 Run 한다. 여러 번 실행해도 안전하다.
-- 설계는 docs/decisions.md 의 "확정한 것: 가계부", docs/ledger-plan.md 참고.

-- 1. 지출 항목. 앱이 id 와 created_at 을 직접 만들어 보낸다(화면을 먼저 바꾸고 서버에 나중에 쓰기 때문).
--    category 는 설정에서 분류를 빼도 이력이 이름 그대로 남아야 하므로 분류 테이블을 가리키지 않는다.
--    amount 는 원 단위 정수이고 승인 취소·환불은 음수다.
create table if not exists public.ledger_entries (
  id          uuid        primary key default gen_random_uuid(),
  spent_on    date        not null,
  method      text        not null check (char_length(btrim(method)) between 1 and 20),
  category    text        not null check (char_length(btrim(category)) between 1 and 10),
  amount      integer     not null check (amount <> 0 and abs(amount) <= 1000000000),
  memo        text        not null default '' check (char_length(memo) <= 100),
  sms_key     text,
  created_at  timestamptz not null default now(),
  user_id     uuid        not null default auth.uid()
);

create index if not exists ledger_entries_spent_idx
  on public.ledger_entries (spent_on desc, created_at desc);

-- 같은 문자를 두 번 가져와도 DB가 막는다. 직접 적은 항목(sms_key 없음)은 제한하지 않는다.
create unique index if not exists ledger_entries_sms_key_idx
  on public.ledger_entries (user_id, sms_key) where sms_key is not null;

-- 2. 분류 목록. position 이 선택지의 순서다. 행이 하나도 없으면 앱이 기본 분류를 채운다.
create table if not exists public.ledger_categories (
  id          uuid        primary key default gen_random_uuid(),
  name        text        not null check (char_length(btrim(name)) between 1 and 10),
  position    integer     not null default 0,
  created_at  timestamptz not null default now(),
  user_id     uuid        not null default auth.uid(),
  unique (user_id, name)
);

-- 3. 예산 규칙. base 는 기본값(사용자당 하나, month 없음), from 은 그 달부터, only 는 그 달만.
--    한 달에 적용되는 값은 앱이 "그 달만 > 그 달 이전 가장 최근 이후 규칙 > 기본값" 순으로 계산한다.
create table if not exists public.ledger_budget_rules (
  id          uuid        primary key default gen_random_uuid(),
  scope       text        not null check (scope in ('base', 'from', 'only')),
  month       date        check (month is null or extract(day from month) = 1),
  amount      integer     not null check (amount between 1 and 1000000000),
  user_id     uuid        not null default auth.uid(),
  constraint ledger_budget_rules_month_check
    check ((scope = 'base' and month is null) or (scope <> 'base' and month is not null))
);

create unique index if not exists ledger_budget_base_idx
  on public.ledger_budget_rules (user_id) where scope = 'base';
create unique index if not exists ledger_budget_month_idx
  on public.ledger_budget_rules (user_id, scope, month) where scope <> 'base';

-- 4. 카드(결제 문자를 보내는 번호). samples 는 그 번호로 온 문자의 견본이다.
create table if not exists public.ledger_cards (
  id          uuid        primary key default gen_random_uuid(),
  name        text        not null check (char_length(btrim(name)) between 1 and 20 and name <> '현금'),
  sender      text        not null check (sender ~ '^[0-9]{3,15}$'),
  samples     text[]      not null default '{}',
  created_at  timestamptz not null default now(),
  user_id     uuid        not null default auth.uid(),
  unique (user_id, name),
  unique (user_id, sender)
);

-- 5. 확인하고 가져오지 않기로 한 문자(읽지 못한 안내문 등). 기기끼리 맞춰 다시 보이지 않게 한다.
create table if not exists public.ledger_dismissed (
  sms_key     text        not null,
  created_at  timestamptz not null default now(),
  user_id     uuid        not null default auth.uid(),
  primary key (user_id, sms_key)
);

-- 6. 로그인한 본인 행만 읽고 쓴다.
do $$
declare
  t text;
begin
  foreach t in array array['ledger_entries', 'ledger_categories', 'ledger_budget_rules', 'ledger_cards', 'ledger_dismissed'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "owner_all" on public.%I', t);
    execute format(
      'create policy "owner_all" on public.%I for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())',
      t
    );
  end loop;
end $$;

-- 7. 다른 기기의 변경이 실시간으로 뜨도록 Realtime 에 등록한다.
do $$
declare
  t text;
begin
  foreach t in array array['ledger_entries', 'ledger_categories', 'ledger_budget_rules', 'ledger_cards', 'ledger_dismissed'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
