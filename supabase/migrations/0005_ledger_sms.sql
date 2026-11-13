-- 0005: 가계부 문자함. 등록한 번호로 온 최근 30일치 문자를 쌓고, 처리 상태를 기기끼리 맞춘다.
-- 0004 를 먼저 실행한 뒤 Supabase 웹 > SQL Editor 에 통째로 붙여 넣고 Run 한다. 여러 번 실행해도 안전하다.
-- 설계는 docs/ledger-plan.md 의 "문자함" 참고.

-- 1. 문자함. 문자 한 통이 한 줄이다.
--    sms_key 는 같은 문자를 두 번 쌓지 않으려는 식별값이라 (user_id, sms_key)가 유일하다. 다시 불러와도 상태가 되돌아가지 않는다.
--    status: pending 처리 필요 / done 항목으로 추가함 / ignored 무시함.
--    30일이 지난 줄은 앱이 문자를 불러올 때 지운다(받은 지 30일 넘은 문자는 폰에서도 읽지 않으므로 다시 나타나지 않는다).
create table if not exists public.ledger_sms (
  id           uuid        primary key default gen_random_uuid(),
  sms_key      text        not null check (char_length(sms_key) between 1 and 200),
  sender       text        not null check (sender ~ '^[0-9]{3,15}$'),
  received_at  timestamptz not null,
  body         text        not null check (char_length(body) between 1 and 2000),
  status       text        not null default 'pending' check (status in ('pending', 'done', 'ignored')),
  user_id      uuid        not null default auth.uid(),
  unique (user_id, sms_key)
);

create index if not exists ledger_sms_received_idx
  on public.ledger_sms (user_id, received_at);

-- 2. 0004 의 "확인한 문자" 표는 문자함의 ignored 상태가 대신하므로 없앤다.
drop table if exists public.ledger_dismissed;

-- 3. 카드의 견본: 문자 본문만 담던 text 배열을 { body, values } 목록(jsonb)으로 바꾼다.
--    values 는 사용자가 그 문자에서 확정한 값(날짜·금액·가맹점)이고, 앱이 여기서 읽는 규칙을 만든다. 카드당 20개까지.
--    예전 배열 컬럼일 때만 바꾸므로 다시 실행해도 견본이 지워지지 않는다.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'ledger_cards' and column_name = 'samples' and data_type = 'ARRAY'
  ) then
    alter table public.ledger_cards drop column samples;
  end if;
end $$;

alter table public.ledger_cards
  add column if not exists samples jsonb not null default '[]'
  check (jsonb_typeof(samples) = 'array' and jsonb_array_length(samples) <= 20);

-- 4. 로그인한 본인 행만 읽고 쓴다.
alter table public.ledger_sms enable row level security;
drop policy if exists "owner_all" on public.ledger_sms;
create policy "owner_all" on public.ledger_sms
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- 5. 다른 기기의 변경이 실시간으로 뜨도록 Realtime 에 등록한다.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'ledger_sms'
  ) then
    alter publication supabase_realtime add table public.ledger_sms;
  end if;
end $$;
