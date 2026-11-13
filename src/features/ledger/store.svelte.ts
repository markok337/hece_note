// 화면이 구독하는 가계부 상태(지출 항목 + 카드). 지금은 메모리에만 있어 새로고침하면 사라진다(시안 단계).
// DB 연동 단계에서 이 파일의 저장 부분만 repo 호출로 바꾼다. 화면이 부르는 메서드의 모양은 그대로 둔다.

import type { Card, LedgerEntry } from "./domain";
import { entriesInMonth, sortNewestFirst } from "./domain";
import type { MonthRef } from "../../core/dates";

export type NewEntry = Omit<LedgerEntry, "id" | "created_at" | "sms_key"> & { sms_key?: string | null };
export type NewCard = Pick<Card, "name" | "sender" | "samples">;

class LedgerStore {
  entries = $state<Record<string, LedgerEntry>>({});
  cards = $state<Record<string, Card>>({});
  /** 가져오지 않기로 한 문자(읽지 못한 안내문 등)의 식별값. 다시 보여 주지 않는다. */
  dismissed = $state<string[]>([]);
  loaded = $state(false);
  /** 서버 연결이 없는 시안 단계라 항상 false. 하단 표시가 "끊김"으로 뜬다. */
  live = $state(false);

  async start(): Promise<void> {
    this.loaded = true;
  }

  async stop(): Promise<void> {
    this.loaded = false;
    this.entries = {};
    this.cards = {};
    this.dismissed = [];
  }

  /** 한 달의 항목. 최근 것이 먼저. */
  entriesIn(ref: MonthRef): LedgerEntry[] {
    return sortNewestFirst(entriesInMonth(Object.values(this.entries), ref));
  }

  cardList(): Card[] {
    return Object.values(this.cards).sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
  }

  /** 이미 처리한 문자의 식별값. 문자 불러오기가 이 값을 건너뛴다. */
  knownSmsKeys(): Set<string> {
    const keys = new Set(this.dismissed);
    for (const entry of Object.values(this.entries)) if (entry.sms_key) keys.add(entry.sms_key);
    return keys;
  }

  async addEntry(input: NewEntry): Promise<boolean> {
    const entry: LedgerEntry = { sms_key: null, ...input, id: crypto.randomUUID(), created_at: new Date().toISOString() };
    this.entries[entry.id] = entry;
    return true;
  }

  async addEntries(inputs: readonly NewEntry[]): Promise<boolean> {
    for (const input of inputs) await this.addEntry(input);
    return true;
  }

  async updateEntry(id: string, patch: Partial<Omit<LedgerEntry, "id" | "created_at" | "sms_key">>): Promise<boolean> {
    const current = this.entries[id];
    if (!current) return false;
    this.entries[id] = { ...current, ...patch };
    return true;
  }

  async removeEntry(id: string): Promise<boolean> {
    if (!(id in this.entries)) return false;
    delete this.entries[id];
    return true;
  }

  async addCard(input: NewCard): Promise<boolean> {
    const card: Card = { ...input, id: crypto.randomUUID(), created_at: new Date().toISOString() };
    this.cards[card.id] = card;
    return true;
  }

  async removeCard(id: string): Promise<boolean> {
    if (!(id in this.cards)) return false;
    delete this.cards[id];
    return true;
  }

  /** 읽지 못한 문자를 확인했다고 표시해 다음 불러오기에서 다시 보이지 않게 한다. */
  dismiss(keys: readonly string[]): void {
    this.dismissed = [...new Set([...this.dismissed, ...keys])];
  }
}

export const ledger = new LedgerStore();
