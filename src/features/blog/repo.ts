// blog_days / blog_category_rules 접근. Supabase 호출은 이 파일에만 둔다.

import type { RealtimeChannel } from "@supabase/supabase-js";
import type { BlogDay, CategoryRule } from "./domain";
import { fetchAllPages } from "../../core/paging";
import { supabase } from "../../supabase";

const DAY_COLUMNS = "day, category, assignee, topic, photo, writing, editing, related, reserved";
const RULE_COLUMNS = "effective_from, anchor_day, cycle";

/** 서버 행에서 앱이 쓰는 컬럼만 남긴다. 실시간 알림에는 user_id 같은 컬럼이 섞여 온다. */
export function pickDay(row: BlogDay): BlogDay {
  const { day, category, assignee, topic, photo, writing, editing, related, reserved } = row;
  return { day, category, assignee, topic, photo, writing, editing, related, reserved };
}

function client() {
  if (!supabase) throw new Error("Supabase 설정이 비어 있다.");
  return supabase;
}

// 서버가 한 번에 1000행까지만 주므로 이어서 받는다. 날짜(기본키) 순으로 잘라 쪽이 겹치지 않게 한다.
export function fetchDays(): Promise<BlogDay[]> {
  return fetchAllPages(async (from, to) => {
    const { data, error } = await client().from("blog_days").select(DAY_COLUMNS).order("day").range(from, to);
    if (error) throw new Error(error.message);
    return data as BlogDay[];
  });
}

export async function fetchRules(): Promise<CategoryRule[]> {
  const { data, error } = await client().from("blog_category_rules").select(RULE_COLUMNS);
  if (error) throw new Error(error.message);
  return data as CategoryRule[];
}

export async function upsertDay(item: BlogDay): Promise<void> {
  const { error } = await client().from("blog_days").upsert(pickDay(item), { onConflict: "day" });
  if (error) throw new Error(error.message);
}

export async function moveDay(from: string, to: string): Promise<void> {
  const { error } = await client().rpc("move_blog_day", { p_from: from, p_to: to });
  if (error) throw new Error(error.message);
}

export interface DayChange {
  kind: "upsert" | "delete";
  day: string;
  row?: BlogDay;
}

/** 다른 기기의 변경을 받는다. 상태 콜백은 연결/끊김마다 불린다. */
export function subscribeDays(
  onChange: (change: DayChange) => void,
  onStatus: (isLive: boolean) => void,
): RealtimeChannel {
  const supa = client();
  return supa
    .channel("blog_days_feed")
    .on("postgres_changes", { event: "*", schema: "public", table: "blog_days" }, (payload) => {
      if (payload.eventType === "DELETE") {
        const old = payload.old as Partial<BlogDay>;
        if (old.day) onChange({ kind: "delete", day: old.day });
        return;
      }
      const row = pickDay(payload.new as BlogDay);
      onChange({ kind: "upsert", day: row.day, row });
    })
    .subscribe((status) => onStatus(status === "SUBSCRIBED"));
}

export async function unsubscribe(channel: RealtimeChannel): Promise<void> {
  await client().removeChannel(channel);
}
