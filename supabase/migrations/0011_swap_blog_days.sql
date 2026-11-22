-- 내용이 있는 날짜로 옮길 때 두 아이템을 한 트랜잭션에서 맞바꾼다.
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
  if p_from = p_to then return; end if;

  perform 1 from public.blog_days
    where day in (p_from, p_to) order by day for update;

  select * into src from public.blog_days where day = p_from;
  if not found then
    raise exception '옮길 아이템이 없다: %', p_from using errcode = 'no_data_found';
  end if;

  select * into dst from public.blog_days where day = p_to;

  insert into public.blog_days
    (day, category, assignee, topic, photo, writing, editing, related, reserved, user_id)
  values
    (p_to, src.category, src.assignee, src.topic, src.photo, src.writing,
     src.editing, src.related, src.reserved, auth.uid())
  on conflict (day) do update set
    category = excluded.category,
    assignee = excluded.assignee,
    topic = excluded.topic,
    photo = excluded.photo,
    writing = excluded.writing,
    editing = excluded.editing,
    related = excluded.related,
    reserved = excluded.reserved;

  if dst.day is not null and (
    dst.assignee is not null or dst.topic is not null or
    dst.photo or dst.writing or dst.editing or dst.related or dst.reserved
  ) then
    update public.blog_days set
      category = dst.category,
      assignee = dst.assignee,
      topic = dst.topic,
      photo = dst.photo,
      writing = dst.writing,
      editing = dst.editing,
      related = dst.related,
      reserved = dst.reserved
    where day = p_from;
  else
    update public.blog_days set
      assignee = null, topic = null,
      photo = false, writing = false, editing = false, related = false, reserved = false
    where day = p_from;
  end if;
end;
$$;
