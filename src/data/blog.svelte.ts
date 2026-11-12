// 화면이 구독하는 블로그 스케줄 상태. 낙관적으로 먼저 바꾸고 저장에 실패하면 되돌린다.

import type { RealtimeChannel } from "@supabase/supabase-js";
import {
  CATEGORIES,
  applyMove,
  defaultCategory,
  emptyDay,
  moveBlock,
  validate,
  type BlogDay,
  type CategoryRule,
} from "../domain/blog";
import { fetchDays, fetchRules, moveDay, subscribeDays, unsubscribe, upsertDay } from "./repo";

export interface Notice {
  kind: "ok" | "err";
  text: string;
}

const NOTICE_MS = 4000;

class BlogStore {
  days = $state<Record<string, BlogDay>>({});
  rules = $state<CategoryRule[]>([]);
  loaded = $state(false);
  live = $state(false);
  notice = $state<Notice | null>(null);

  #channel: RealtimeChannel | null = null;
  #noticeTimer: ReturnType<typeof setTimeout> | undefined;

  /** 저장된 아이템. 한 번도 건드린 적 없는 날짜는 null. */
  stored(day: string): BlogDay | null {
    return this.days[day] ?? null;
  }

  /** 화면에 보일 아이템. 저장된 게 없으면 기본 분야만 채운 빈 아이템. */
  view(day: string): BlogDay {
    return this.days[day] ?? emptyDay(day, defaultCategory(day, this.rules) ?? CATEGORIES[0]);
  }

  say(kind: Notice["kind"], text: string): void {
    this.notice = { kind, text };
    clearTimeout(this.#noticeTimer);
    this.#noticeTimer = setTimeout(() => (this.notice = null), NOTICE_MS);
  }

  async load(): Promise<void> {
    try {
      const [rows, rules] = await Promise.all([fetchDays(), fetchRules()]);
      this.days = Object.fromEntries(rows.map((row) => [row.day, row]));
      this.rules = rules;
      this.loaded = true;
    } catch (err) {
      this.say("err", `불러오기 실패: ${(err as Error).message}`);
    }
  }

  async start(): Promise<void> {
    await this.load();
    this.#channel = subscribeDays(
      (change) => {
        if (change.kind === "delete") {
          const { [change.day]: _removed, ...rest } = this.days;
          this.days = rest;
        } else if (change.row) {
          this.days[change.day] = change.row;
        }
      },
      (isLive) => {
        this.live = isLive;
        // 끊겼다 다시 붙으면 그사이 놓친 변경을 다시 가져온다.
        if (isLive) void this.load();
      },
    );
  }

  async stop(): Promise<void> {
    if (this.#channel) await unsubscribe(this.#channel);
    this.#channel = null;
    this.live = false;
    this.loaded = false;
    this.days = {};
  }

  /** 아이템 하나를 바꿔 저장한다. 잠금 규칙을 어기면 저장하지 않고 이유를 알린다. */
  async save(next: BlogDay): Promise<boolean> {
    const reason = validate(next);
    if (reason) {
      this.say("err", reason);
      return false;
    }
    const prev = this.days[next.day];
    this.days[next.day] = next;
    try {
      await upsertDay(next);
      return true;
    } catch (err) {
      if (prev) this.days[next.day] = prev;
      else delete this.days[next.day];
      this.say("err", `저장 실패: ${(err as Error).message}`);
      return false;
    }
  }

  async patch(day: string, change: Partial<Omit<BlogDay, "day">>): Promise<boolean> {
    return this.save({ ...this.view(day), ...change });
  }

  async move(from: string, to: string): Promise<boolean> {
    if (from === to) return false;
    const reason = moveBlock(this.stored(from), this.stored(to));
    if (reason) {
      this.say("err", reason);
      return false;
    }
    const src = this.stored(from)!;
    const prevFrom = this.days[from];
    const prevTo = this.days[to];
    const { moved, vacated } = applyMove(src, to);
    this.days[to] = moved;
    this.days[from] = vacated;
    try {
      await moveDay(from, to);
      return true;
    } catch (err) {
      this.days[from] = prevFrom;
      if (prevTo) this.days[to] = prevTo;
      else delete this.days[to];
      this.say("err", `이동 실패: ${(err as Error).message}`);
      return false;
    }
  }
}

export const blog = new BlogStore();
