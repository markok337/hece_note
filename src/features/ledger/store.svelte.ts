// 화면이 구독하는 가계부 상태(지출 항목, 카드, 분류, 예산 규칙, 확인한 문자). 냉장고 스토어와 같은 방식이다:
// 낙관적으로 먼저 바꾸고, 저장에 실패하면 서버 값으로 되돌린다.

import type { RealtimeChannel } from "@supabase/supabase-js";
import type { BudgetRow, BudgetRules, BudgetScope, Card, CategoryRow, LedgerEntry } from "./domain";
import {
  DEFAULT_CATEGORIES,
  budgetFor,
  emptyBudgetRules,
  entriesInMonth,
  monthKey,
  sortNewestFirst,
} from "./domain";
import {
  deleteBudgetRule,
  deleteCard,
  deleteCategory,
  deleteEntry,
  fetchBudgetRules,
  fetchCards,
  fetchCategories,
  fetchDismissed,
  fetchEntries,
  insertDismissed,
  seedCategories,
  subscribeLedger,
  unsubscribe,
  upsertBudgetRule,
  upsertCard,
  upsertCategory,
  upsertEntries,
  upsertEntry,
  type RowChange,
} from "./repo";
import type { MonthRef } from "../../core/dates";
import { notice } from "../../core/notice.svelte";
import { WriteQueue } from "../../core/write-queue";

const NOT_LOADED_MESSAGE = "아직 불러오지 못했다. 새로고침 후 다시 시도한다.";

export type NewEntry = Omit<LedgerEntry, "id" | "created_at" | "sms_key"> & { sms_key?: string | null };
export type NewCard = Pick<Card, "name" | "sender" | "samples">;

/** 실시간 알림 하나를 목록에 반영한다. */
function applyChange<T>(map: Record<string, T>, change: RowChange<T>): void {
  if (change.kind === "delete") delete map[change.id];
  else if (change.row) map[change.id] = change.row;
}

/** 서버에 분류가 하나도 없을 때 채울 기본 분류. */
function defaultCategoryRows(): CategoryRow[] {
  const created_at = new Date().toISOString();
  return DEFAULT_CATEGORIES.map((name, position) => ({ id: crypto.randomUUID(), name, position, created_at }));
}

const toMap = <T extends { id: string }>(rows: readonly T[]): Record<string, T> =>
  Object.fromEntries(rows.map((row) => [row.id, row]));

class LedgerStore {
  entries = $state<Record<string, LedgerEntry>>({});
  cards = $state<Record<string, Card>>({});
  categoryRows = $state<Record<string, CategoryRow>>({});
  budgetRows = $state<Record<string, BudgetRow>>({});
  /** 가져오지 않기로 한 문자(읽지 못한 안내문 등)의 식별값. 다시 보여 주지 않는다. */
  dismissed = $state<string[]>([]);
  loaded = $state(false);
  live = $state(false);

  #channel: RealtimeChannel | null = null;
  // 블로그·냉장고 스토어와 같은 방식이다: 쓰는 동안 들어온 알림과 불러오기는 미루고, 끝나면 한 번만 다시 불러온다.
  #writes = new WriteQueue(() => void this.load());
  #epoch = 0;
  #loadSeq = 0;

  /** 설정 탭에서 관리하는 분류 목록. 새 항목의 선택지이고, 추가한 순서를 지킨다. 불러오기 전에는 기본 분류다. */
  get categories(): string[] {
    const rows = Object.values(this.categoryRows);
    if (rows.length === 0) return [...DEFAULT_CATEGORIES];
    return rows
      .sort((a, b) => a.position - b.position || Date.parse(a.created_at) - Date.parse(b.created_at))
      .map((row) => row.name);
  }

  /** 예산 규칙(기본값, 이 달부터, 이 달만). 한 달의 예산은 domain.budgetFor 가 정한다. */
  get budgetRules(): BudgetRules {
    const rules = emptyBudgetRules();
    for (const row of Object.values(this.budgetRows)) {
      if (row.scope === "base") rules.base = row.amount;
      else if (row.month) rules[row.scope][row.month.slice(0, 7)] = row.amount;
    }
    return rules;
  }

  async load(): Promise<void> {
    if (this.#writes.busy) {
      this.#writes.markDirty();
      return;
    }
    const seq = ++this.#loadSeq;
    const epoch = this.#epoch;
    try {
      const [entries, cards, budgets, dismissed] = await Promise.all([
        fetchEntries(),
        fetchCards(),
        fetchBudgetRules(),
        fetchDismissed(),
      ]);
      let categories = await fetchCategories();
      if (categories.length === 0) {
        await seedCategories(defaultCategoryRows());
        categories = await fetchCategories();
      }
      if (seq !== this.#loadSeq) return;
      // 응답을 기다리는 사이 쓰기가 시작됐다면 이 값은 내 변경보다 오래됐다. 버리고 쓰기가 끝난 뒤 다시 받는다.
      if (epoch !== this.#epoch) {
        if (this.#writes.busy) this.#writes.markDirty();
        else void this.load();
        return;
      }
      this.entries = toMap(entries);
      this.cards = toMap(cards);
      this.categoryRows = toMap(categories);
      this.budgetRows = toMap(budgets);
      this.dismissed = dismissed;
      this.loaded = true;
    } catch (err) {
      notice.say("err", `불러오기 실패: ${(err as Error).message}`);
    }
  }

  async start(): Promise<void> {
    await this.load();
    this.#channel = subscribeLedger({
      onEntry: (change) => this.#receive(() => applyChange(this.entries, change)),
      onCard: (change) => this.#receive(() => applyChange(this.cards, change)),
      onCategory: (change) => this.#receive(() => applyChange(this.categoryRows, change)),
      onBudget: (change) => this.#receive(() => applyChange(this.budgetRows, change)),
      onDismissed: (key) => this.#receive(() => (this.dismissed = [...new Set([...this.dismissed, key])])),
      onStatus: (isLive) => {
        this.live = isLive;
        // 끊겼다 다시 붙으면 그사이 놓친 변경을 다시 가져온다.
        if (isLive) void this.load();
      },
    });
  }

  async stop(): Promise<void> {
    if (this.#channel) await unsubscribe(this.#channel);
    this.#channel = null;
    this.live = false;
    this.loaded = false;
    this.#loadSeq += 1; // 로그아웃 뒤에 늦게 도착한 응답이 화면을 채우지 않게 한다.
    this.entries = {};
    this.cards = {};
    this.categoryRows = {};
    this.budgetRows = {};
    this.dismissed = [];
  }

  #receive(apply: () => void): void {
    if (this.#writes.busy) this.#writes.markDirty();
    else apply();
  }

  /** 화면을 먼저 바꾸고 서버에는 누른 순서대로 보낸다. 못 불러온 채 쓰면 서버 내용을 덮을 수 있어 막는다. */
  #write(apply: () => void, task: () => Promise<void>, failure: string): Promise<boolean> {
    if (!this.loaded) {
      notice.say("err", NOT_LOADED_MESSAGE);
      return Promise.resolve(false);
    }
    this.#epoch += 1;
    apply();
    return this.#writes.run(task, (err) => notice.say("err", `${failure}: ${(err as Error).message}`));
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

  #newEntry(input: NewEntry): LedgerEntry {
    return { sms_key: null, ...input, id: crypto.randomUUID(), created_at: new Date().toISOString() };
  }

  addEntry(input: NewEntry): Promise<boolean> {
    const entry = this.#newEntry(input);
    return this.#write(
      () => (this.entries[entry.id] = entry),
      () => upsertEntry(entry),
      "지출 추가 실패",
    );
  }

  /** 문자에서 가져온 여러 건을 한 번에 저장한다. 하나라도 실패하면 전부 되돌아간다. */
  addEntries(inputs: readonly NewEntry[]): Promise<boolean> {
    const added = inputs.map((input) => this.#newEntry(input));
    if (added.length === 0) return Promise.resolve(true);
    return this.#write(
      () => {
        for (const entry of added) this.entries[entry.id] = entry;
      },
      () => upsertEntries(added),
      "지출 추가 실패",
    );
  }

  updateEntry(id: string, patch: Partial<Omit<LedgerEntry, "id" | "created_at" | "sms_key">>): Promise<boolean> {
    const current = this.entries[id];
    if (!current) return Promise.resolve(false);
    const next = { ...current, ...patch };
    return this.#write(
      () => (this.entries[id] = next),
      () => upsertEntry(next),
      "지출 저장 실패",
    );
  }

  removeEntry(id: string): Promise<boolean> {
    if (!(id in this.entries)) return Promise.resolve(false);
    return this.#write(
      () => delete this.entries[id],
      () => deleteEntry(id),
      "지출 삭제 실패",
    );
  }

  addCard(input: NewCard): Promise<boolean> {
    const card: Card = { ...input, id: crypto.randomUUID(), created_at: new Date().toISOString() };
    return this.#write(
      () => (this.cards[card.id] = card),
      () => upsertCard(card),
      "카드 추가 실패",
    );
  }

  removeCard(id: string): Promise<boolean> {
    if (!(id in this.cards)) return Promise.resolve(false);
    return this.#write(
      () => delete this.cards[id],
      () => deleteCard(id),
      "카드 삭제 실패",
    );
  }

  /** 분류를 더한다. 이름이 올바른지(비었는지, 겹치는지)는 부르는 쪽이 확인한다. */
  addCategory(name: string): Promise<boolean> {
    if (this.categories.includes(name)) return Promise.resolve(false);
    const position = Math.max(-1, ...Object.values(this.categoryRows).map((row) => row.position)) + 1;
    const row: CategoryRow = { id: crypto.randomUUID(), name, position, created_at: new Date().toISOString() };
    return this.#write(
      () => (this.categoryRows[row.id] = row),
      () => upsertCategory(row),
      "분류 추가 실패",
    );
  }

  /** 분류를 선택지에서 뺀다. 그 분류로 적은 이력은 이름 그대로 남는다. 마지막 하나는 지울 수 없다. */
  removeCategory(name: string): Promise<boolean> {
    const row = Object.values(this.categoryRows).find((candidate) => candidate.name === name);
    if (!row || Object.keys(this.categoryRows).length <= 1) return Promise.resolve(false);
    return this.#write(
      () => delete this.categoryRows[row.id],
      () => deleteCategory(row.id),
      "분류 삭제 실패",
    );
  }

  /** 그 달에 적용되는 예산. 정한 적이 없으면 null. */
  budgetFor(ref: MonthRef): number | null {
    return budgetFor(this.budgetRules, ref);
  }

  /** 같은 범위·달의 규칙 행. 있으면 그 행을 고쳐 쓰고, 없으면 새로 만든다. */
  #budgetRow(scope: BudgetScope, month: string | null): BudgetRow | undefined {
    return Object.values(this.budgetRows).find((row) => row.scope === scope && row.month === month);
  }

  /**
   * 예산을 정한다. base 는 기본값, from 은 ref 의 달부터 다음 변경까지, only 는 ref 의 그 달만이다.
   * 값이 올바른지는 부르는 쪽이 확인한다.
   */
  setBudget(scope: BudgetScope, amount: number, ref: MonthRef): Promise<boolean> {
    const month = scope === "base" ? null : `${monthKey(ref)}-01`;
    const row: BudgetRow = { id: this.#budgetRow(scope, month)?.id ?? crypto.randomUUID(), scope, month, amount };
    return this.#write(
      () => (this.budgetRows[row.id] = row),
      () => upsertBudgetRule(row),
      "예산 저장 실패",
    );
  }

  /** "이 달부터" 또는 "이 달만" 규칙 하나를 지운다. key 는 "2026-11". */
  removeBudgetRule(scope: Exclude<BudgetScope, "base">, key: string): Promise<boolean> {
    const row = this.#budgetRow(scope, `${key}-01`);
    if (!row) return Promise.resolve(false);
    return this.#write(
      () => delete this.budgetRows[row.id],
      () => deleteBudgetRule(row.id),
      "예산 삭제 실패",
    );
  }

  /** 읽지 못한 문자를 확인했다고 표시해 다음 불러오기에서 다시 보이지 않게 한다. */
  dismiss(keys: readonly string[]): Promise<boolean> {
    const fresh = [...new Set(keys)].filter((key) => !this.dismissed.includes(key));
    if (fresh.length === 0) return Promise.resolve(true);
    return this.#write(
      () => (this.dismissed = [...this.dismissed, ...fresh]),
      () => insertDismissed(fresh),
      "문자 확인 표시 실패",
    );
  }
}

export const ledger = new LedgerStore();
