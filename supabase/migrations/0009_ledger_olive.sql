-- 지출마다 올영 3000원·4000원 선택 여부를 저장한다.
-- 새 앱을 열기 전에 Supabase SQL Editor에서 실행한다.
alter table public.ledger_entries
  add column if not exists olive_3000 boolean not null default false,
  add column if not exists olive_4000 boolean not null default false;
