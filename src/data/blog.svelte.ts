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
import { WriteQueue } from "./write-queue";

export interface Notice {
  kind: "ok" | "err";
  text: string;
}

const NOTICE_MS = 4000;
const NOT_LOADED_MESSAGE = "아직 불러오지 못했다. 새로고침 후 다시 시도한다.";
const NO_RULES_MESSAGE = "분야 순환 규칙이 없다. supabase/blog_schema.sql 을 실행했는지 확인한다.";

class BlogStore {
  days = $state<Record<string, BlogDay>>({});
  rules = $state<CategoryRule[]>([]);
  loaded = $state(false);
  live = $state(false);
  notice = $state<Notice | null>(null);

  #channel: RealtimeChannel | null = null;
  // 쓰는 동안 들어온 실시간 알림은 내 최신 상태보다 오래된 값일 수 있어 무시하고, 끝나면 한 번 다시 불러온다.
  #writes = new WriteQueue(() => void this.load());
  #noticeTimer: ReturnType<typeof setTimeout> | undefined;
  // 불러오기 응답이 오래된 것인지 가려내는 표. 쓰기를 시작할 때마다 epoch 가, 불러오기를 시작할 때마다 loadSeq 가 오른다.
  #epoch = 0;
  #loadSeq = 0;

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
    if (this.#writes.busy) {
      // 지금 불러오면 방금 바꾼 화면이 서버의 옛 값으로 덮인다. 쓰기가 끝난 뒤에 불러온다.
      this.#writes.markDirty();
      return;
    }
    const seq = ++this.#loadSeq;
    const epoch = this.#epoch;
    try {
      const [rows, rules] = await Promise.all([fetchDays(), fetchRules()]);
      // 더 늦게 시작한 불러오기가 있으면 그쪽 결과가 최신이다.
      if (seq !== this.#loadSeq) return;
      // 응답을 기다리는 사이 쓰기가 시작됐다면 이 값은 내 변경보다 오래됐다. 버리고 쓰기가 끝난 뒤 다시 받는다.
      if (epoch !== this.#epoch) {
        if (this.#writes.busy) this.#writes.markDirty();
        else void this.load();
        return;
      }
      this.days = Object.fromEntries(rows.map((row) => [row.day, row]));
      this.rules = rules;
      this.loaded = true;
      if (rules.length === 0) this.say("err", NO_RULES_MESSAGE);
    } catch (err) {
      this.say("err", `불러오기 실패: ${(err as Error).message}`);
    }
  }

  async start(): Promise<void> {
    await this.load();
    this.#channel = subscribeDays(
      (change) => {
        if (this.#writes.busy) {
          this.#writes.markDirty();
          return;
        }
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
    this.#loadSeq += 1; // 로그아웃 뒤에 늦게 도착한 응답이 화면을 채우지 않게 한다.
    this.days = {};
  }

  /** 아이템 하나를 바꿔 저장한다. 화면은 먼저 바꾸고, 서버에는 누른 순서대로 보낸다. */
  async save(next: BlogDay): Promise<boolean> {
    const blocked = this.#writeBlock(next.day);
    if (blocked) {
      this.say("err", blocked);
      return false;
    }
    const reason = validate(next);
    if (reason) {
      this.say("err", reason);
      return false;
    }
    this.#epoch += 1;
    this.days[next.day] = next;
    return this.#writes.run(
      () => upsertDay(next),
      (err) => this.say("err", `저장 실패: ${(err as Error).message}`),
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
      this.say("err", NOT_LOADED_MESSAGE);
      return false;
    }
    const reason = moveBlock(this.stored(from), this.stored(to));
    if (reason) {
      this.say("err", reason);
      return false;
    }
    this.#epoch += 1;
    const { moved, vacated } = applyMove(this.stored(from)!, to);
    this.days[to] = moved;
    this.days[from] = vacated;
    // 실패하면 쓰기가 끝난 뒤 서버 값으로 다시 맞춘다.
    return this.#writes.run(
      () => moveDay(from, to),
      (err) => this.say("err", `이동 실패: ${(err as Error).message}`),
    );
  }
}

export const blog = new BlogStore();
