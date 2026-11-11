-- 토이 앱: 기기 접속 기록 테이블.
-- Supabase 웹 > SQL Editor 에 통째로 붙여 넣고 Run 한다. 여러 번 실행해도 안전하다.

create table if not exists public.device_pings (
  id          bigint generated always as identity primary key,
  device_name text        not null check (char_length(device_name) between 1 and 40),
  build_id    text        not null,
  user_id     uuid        not null default auth.uid(),
  created_at  timestamptz not null default now()
);

alter table public.device_pings enable row level security;

-- 로그인한 본인 행만 읽고 쓴다. 로그인 안 한 요청(anon)은 아무것도 못 한다.
drop policy if exists "owner_select" on public.device_pings;
create policy "owner_select" on public.device_pings
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "owner_insert" on public.device_pings;
create policy "owner_insert" on public.device_pings
  for insert to authenticated with check (user_id = auth.uid());

-- 다른 기기에서 넣은 행이 실시간으로 화면에 뜨도록 Realtime 에 등록한다.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'device_pings'
  ) then
    alter publication supabase_realtime add table public.device_pings;
  end if;
end $$;
