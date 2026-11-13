-- 0006: 지출에 "실적" 표시를 단다. 한 달에 정해진 개수(앱에서 10개)를 채워야 하는 결제를 세는 데 쓴다.
-- Supabase 웹 > SQL Editor 에 통째로 붙여 넣고 Run 한다. 여러 번 실행해도 안전하다.
-- 앱을 이 버전으로 열기 전에 먼저 실행한다. 실행하기 전에는 가계부 탭이 "불러오기 실패"를 띄운다.

alter table public.ledger_entries
  add column if not exists perf boolean not null default false;
