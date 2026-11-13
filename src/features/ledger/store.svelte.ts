// 화면이 구독하는 가계부 상태(지출 항목 + 카드 + 설정). 지금은 메모리에만 있어 새로고침하면 사라진다(시안 단계).
// DB 연동 단계에서 이 파일의 저장 부분만 repo 호출로 바꾼다. 화면이 부르는 메서드의 모양은 그대로 둔다.

import type { BudgetRules, BudgetScope, Card, LedgerEntry } from "./domain";
import {
  DEFAULT_CATEGORIES,
  budgetFor,
  emptyBudgetRules,
  entriesInMonth,
  monthKey,
  sortNewestFirst,
} from "./domain";
import type { MonthRef } from "../../core/dates";

export type NewEntry = Omit<LedgerEntry, "id" | "created_at" | "sms_key"> & { sms_key?: string | null };
export type NewCard = Pick<Card, "name" | "sender" | "samples">;

class LedgerStore {
  entries = $state<Record<string, LedgerEntry>>({});
  cards = $state<Record<string, Card>>({});
  /** 설정 탭에서 관리하는 분류 목록. 새 항목의 선택지이고, 추가한 순서를 지킨다. */
  categories = $state<string[]>([...DEFAULT_CATEGORIES]);
  /** 예산 규칙(기본값, 이 달부터, 이 달만). 한 달의 예산은 domain.budgetFor 가 정한다. */
  budgetRules = $state<BudgetRules>(emptyBudgetRules());
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
    this.categories = [...DEFAULT_CATEGORIES];
    this.budgetRules = emptyBudgetRules();
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

  /**
   * 분류 선택지. 설정의 분류에 더해, 지워진 분류로 적은 이력이 있으면 그 이름도 넣는다(이력은 지우지 않는다).
   * extra 는 지금 고치는 항목의 분류처럼 반드시 포함할 이름이다.
   */
  categoryChoices(...extra: string[]): string[] {
    return [...new Set([...this.categories, ...extra])];
  }

  /** 그 분류로 적은 항목 수. 설정에서 지우기 전에 보여 준다. */
  categoryUsage(name: string): number {
    return Object.values(this.entries).filter((entry) => entry.category === name).length;
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

  /** 분류를 더한다. 이름이 올바른지(비었는지, 겹치는지)는 부르는 쪽이 확인한다. */
  async addCategory(name: string): Promise<boolean> {
    if (this.categories.includes(name)) return false;
    this.categories.push(name);
    return true;
  }

  /** 분류를 선택지에서 뺀다. 그 분류로 적은 이력은 이름 그대로 남는다. 마지막 하나는 지울 수 없다. */
  async removeCategory(name: string): Promise<boolean> {
    if (this.categories.length <= 1 || !this.categories.includes(name)) return false;
    this.categories = this.categories.filter((category) => category !== name);
    return true;
  }

  /** 그 달에 적용되는 예산. 정한 적이 없으면 null. */
  budgetFor(ref: MonthRef): number | null {
    return budgetFor(this.budgetRules, ref);
  }

  /**
   * 예산을 정한다. base 는 기본값, from 은 ref 의 달부터 다음 변경까지, only 는 ref 의 그 달만이다.
   * 값이 올바른지는 부르는 쪽이 확인한다.
   */
  async setBudget(scope: BudgetScope, amount: number, ref: MonthRef): Promise<boolean> {
    if (scope === "base") this.budgetRules.base = amount;
    else this.budgetRules[scope][monthKey(ref)] = amount;
    return true;
  }

  /** "이 달부터" 또는 "이 달만" 규칙 하나를 지운다. */
  async removeBudgetRule(scope: Exclude<BudgetScope, "base">, key: string): Promise<boolean> {
    if (!(key in this.budgetRules[scope])) return false;
    delete this.budgetRules[scope][key];
    return true;
  }

  /** 읽지 못한 문자를 확인했다고 표시해 다음 불러오기에서 다시 보이지 않게 한다. */
  dismiss(keys: readonly string[]): void {
    this.dismissed = [...new Set([...this.dismissed, ...keys])];
  }
}

export const ledger = new LedgerStore();
