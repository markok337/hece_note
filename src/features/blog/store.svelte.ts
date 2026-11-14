// 화면이 구독하는 블로그 스케줄 상태. 낙관적으로 먼저 바꾸고 저장에 실패하면 되돌린다.
// 불러오기·쓰기 줄 세우기·실시간 알림 처리의 공통 규칙은 core/synced-store 에 있다.

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
} from "./domain";
import { fetchDays, fetchRules, moveDay, subscribeDays, unsubscribe, upsertDay } from "./repo";
import { notice } from "../../core/notice.svelte";
import { NOT_LOADED_MESSAGE, SyncedStore, type Receive, type StatusHandler } from "../../core/synced-store.svelte";

const NO_RULES_MESSAGE = "분야 순환 규칙이 없다. supabase/migrations/0002_blog.sql 을 실행했는지 확인한다.";

interface Snapshot {
  rows: BlogDay[];
  rules: CategoryRule[];
}

class BlogStore extends SyncedStore<Snapshot> {
  days = $state<Record<string, BlogDay>>({});
  rules = $state<CategoryRule[]>([]);

  /** 저장된 아이템. 한 번도 건드린 적 없는 날짜는 null. */
  stored(day: string): BlogDay | null {
    return this.days[day] ?? null;
  }

  /** 화면에 보일 아이템. 저장된 게 없으면 기본 분야만 채운 빈 아이템. */
  view(day: string): BlogDay {
    return this.days[day] ?? emptyDay(day, defaultCategory(day, this.rules) ?? CATEGORIES[0]);
  }

  protected async fetchSnapshot(): Promise<Snapshot> {
    const [rows, rules] = await Promise.all([fetchDays(), fetchRules()]);
    return { rows, rules };
  }

  protected applySnapshot({ rows, rules }: Snapshot): void {
    this.days = Object.fromEntries(rows.map((row) => [row.day, row]));
    this.rules = rules;
    if (rules.length === 0) notice.say("err", NO_RULES_MESSAGE);
  }

  protected clearData(): void {
    this.days = {};
  }

  protected subscribe(receive: Receive, onStatus: StatusHandler): RealtimeChannel {
    return subscribeDays((change) => {
      receive(() => {
        if (change.kind === "delete") {
          const { [change.day]: _removed, ...rest } = this.days;
          this.days = rest;
        } else if (change.row) {
          this.days[change.day] = change.row;
        }
      });
    }, onStatus);
  }

  protected unsubscribe(channel: RealtimeChannel): Promise<void> {
    return unsubscribe(channel);
  }

  /** 아이템 하나를 바꿔 저장한다. 화면은 먼저 바꾸고, 서버에는 누른 순서대로 보낸다. */
  async save(next: BlogDay): Promise<boolean> {
    const blocked = this.#writeBlock(next.day);
    if (blocked) {
      notice.say("err", blocked);
      return false;
    }
    const reason = validate(next);
    if (reason) {
      notice.say("err", reason);
      return false;
    }
    return this.write(
      () => (this.days[next.day] = next),
      () => upsertDay(next),
      "저장 실패",
    );
  }

  /** 저장하면 안 되는 상태면 이유를 돌려준다. 못 불러온 채 저장하면 서버에 있던 내용을 빈 값으로 덮는다. */
  #writeBlock(day: string): string | null {
    if (!this.loaded) return NOT_LOADED_MESSAGE;
    // 처음 건드리는 날짜는 규칙으로 분야를 정한다. 규칙이 없으면 엉뚱한 분야가 저장되므로 막는다.
    if (!this.stored(day) && defaultCategory(day, this.rules) === null) return NO_RULES_MESSAGE;
    return null;
  }

  async patch(day: string, change: Partial<Omit<BlogDay, "day">>): Promise<boolean> {
    return this.save({ ...this.view(day), ...change });
  }

  async move(from: string, to: string): Promise<boolean> {
    if (from === to) return false;
    if (!this.loaded) {
      notice.say("err", NOT_LOADED_MESSAGE);
      return false;
    }
    const reason = moveBlock(this.stored(from), this.stored(to));
    if (reason) {
      notice.say("err", reason);
      return false;
    }
    const { moved, vacated } = applyMove(this.stored(from)!, to);
    // 실패하면 쓰기가 끝난 뒤 서버 값으로 다시 맞춘다.
    return this.write(
      () => {
        this.days[to] = moved;
        this.days[from] = vacated;
      },
      () => moveDay(from, to),
      "이동 실패",
    );
  }
}

export const blog = new BlogStore();
