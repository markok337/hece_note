-- 같은 사용자가 같은 날짜에 같은 사람의 책을 두 권 등록하지 못하게 한다.
-- 기존 기간이 겹치는 책이 있다면 먼저 날짜를 정리한 뒤 실행한다.
create extension if not exists btree_gist;

alter table public.reading_days
  add column if not exists exercise_haeng boolean not null default false,
  add column if not exists exercise_chaeng boolean not null default false;

alter table public.reading_books
  add constraint reading_books_one_per_reader_day
  exclude using gist (
    user_id with =,
    reader with =,
    daterange(start_day, coalesce(end_day, 'infinity'::date), '[]') with &&
  );
