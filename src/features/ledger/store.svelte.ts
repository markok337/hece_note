// 화면이 구독하는 가계부 상태(지출 항목, 카드, 분류, 예산 규칙, 문자함). 냉장고 스토어와 같은 방식이다:
// 낙관적으로 먼저 바꾸고, 저장에 실패하면 서버 값으로 되돌린다.
// 불러오기·쓰기 줄 세우기·실시간 알림 처리의 공통 규칙은 core/synced-store 에 있다.

import type { RealtimeChannel } from "@supabase/supabase-js";
import type { BudgetRow, BudgetRules, BudgetScope, Card, CategoryRow, LedgerEntry, SmsRow, SmsSample, SmsStatus } from "./domain";
import {
  DEFAULT_CATEGORIES,
  SAVINGS_CATEGORY,
  SMS_BODY_MAX,
  budgetFor,
  emptyBudgetRules,
  entriesInMonth,
  monthKey,
  smsCutoff,
  sortNewestFirst,
} from "./domain";
import {
  deleteBudgetRule,
  deleteCard,
  deleteCategory,
  deleteEntry,
  deleteSmsBefore,
  fetchBudgetRules,
  fetchCards,
  fetchCategories,
  fetchEntries,
  fetchSms,
  insertSms,
  resetIgnoredSms,
  seedCategories,
  setSmsStatus,
  subscribeLedger,
  unsubscribe,
  upsertBudgetRule,
  upsertCard,
  upsertCategories,
  upsertCategory,
  upsertEntries,
  upsertEntry,
  type RowChange,
} from "./repo";
import type { MonthRef } from "../../core/dates";
import { SyncedStore, type Receive, type StatusHandler } from "../../core/synced-store.svelte";

interface Snapshot {
  entries: LedgerEntry[];
  cards: Card[];
  categories: CategoryRow[];
  budgets: BudgetRow[];
  sms: SmsRow[];
}

export type NewEntry = Omit<LedgerEntry, "id" | "created_at" | "sms_key" | "perf"> & { sms_key?: string | null; perf?: boolean };
export type NewCard = Pick<Card, "name" | "sender" | "samples">;
/** 폰에서 읽어 온 문자 한 통. 처리 상태는 문자함이 정한다. */
export type NewSms = Omit<SmsRow, "id" | "status">;

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

class LedgerStore extends SyncedStore<Snapshot> {
  entries = $state<Record<string, LedgerEntry>>({});
  cards = $state<Record<string, Card>>({});
  categoryRows = $state<Record<string, CategoryRow>>({});
  budgetRows = $state<Record<string, BudgetRow>>({});
  /** 문자함. 등록한 번호로 온 최근 30일치 문자와 처리 상태. */
  sms = $state<Record<string, SmsRow>>({});

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

  protected async fetchSnapshot(): Promise<Snapshot> {
    const [entries, cards, budgets, sms] = await Promise.all([fetchEntries(), fetchCards(), fetchBudgetRules(), fetchSms()]);
    let categories = await fetchCategories();
    if (categories.length === 0) {
      await seedCategories(defaultCategoryRows());
      categories = await fetchCategories();
    }
    return { entries, cards, categories, budgets, sms };
  }

  protected applySnapshot({ entries, cards, categories, budgets, sms }: Snapshot): void {
    this.entries = toMap(entries);
    this.cards = toMap(cards);
    this.categoryRows = toMap(categories);
    this.budgetRows = toMap(budgets);
    this.sms = toMap(sms);
  }

  protected clearData(): void {
    this.entries = {};
    this.cards = {};
    this.categoryRows = {};
    this.budgetRows = {};
    this.sms = {};
  }

  protected subscribe(receive: Receive, onStatus: StatusHandler): RealtimeChannel {
    return subscribeLedger({
      onEntry: (change) => receive(() => applyChange(this.entries, change)),
      onCard: (change) => receive(() => applyChange(this.cards, change)),
      onCategory: (change) => receive(() => applyChange(this.categoryRows, change)),
      onBudget: (change) => receive(() => applyChange(this.budgetRows, change)),
      onSms: (change) => receive(() => applyChange(this.sms, change)),
      onStatus,
    });
  }

  protected unsubscribe(channel: RealtimeChannel): Promise<void> {
    return unsubscribe(channel);
  }

  /** 한 달의 항목. 최근 것이 먼저. */
  entriesIn(ref: MonthRef): LedgerEntry[] {
    return sortNewestFirst(entriesInMonth(Object.values(this.entries), ref));
  }

  cardList(): Card[] {
    return Object.values(this.cards).sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
  }

  /**
   * 처리가 필요한 문자. 최근 것이 먼저다.
   * 항목이 이미 그 문자를 가리키면(완료 표시를 서버에 쓰다 실패한 경우 등) 처리한 것으로 본다.
   */
  pendingSms(): SmsRow[] {
    const done = new Set<string>();
    for (const entry of Object.values(this.entries)) if (entry.sms_key) done.add(entry.sms_key);
    return Object.values(this.sms)
      .filter((row) => row.status === "pending" && !done.has(row.sms_key))
      .sort((a, b) => Date.parse(b.received_at) - Date.parse(a.received_at) || (a.id < b.id ? -1 : 1));
  }

  /** 무시한 문자 수. */
  get ignoredCount(): number {
    return Object.values(this.sms).filter((row) => row.status === "ignored").length;
  }

  /** 문자함에서 keys 에 해당하는 처리 필요 줄을 완료로 바꾼 새 줄들. */
  #doneRows(keys: readonly (string | null | undefined)[]): SmsRow[] {
    const wanted = new Set(keys.filter((key): key is string => !!key));
    return Object.values(this.sms)
      .filter((row) => wanted.has(row.sms_key) && row.status !== "done")
      .map((row) => ({ ...row, status: "done" as SmsStatus }));
  }

  /**
   * 분류 선택지. 설정의 분류에 더해, 지워진 분류로 적은 이력이 있으면 그 이름도 넣는다(이력은 지우지 않는다).
   * extra 는 지금 고치는 항목의 분류처럼 반드시 포함할 이름이다.
   */
  categoryChoices(...extra: string[]): string[] {
    return [...new Set([...this.categories, ...extra])];
  }

  #newEntry(input: NewEntry): LedgerEntry {
    return { sms_key: null, perf: false, ...input, id: crypto.randomUUID(), created_at: new Date().toISOString() };
  }

  addEntry(input: NewEntry): Promise<boolean> {
    const entry = this.#newEntry(input);
    const done = this.#doneRows([entry.sms_key]);
    return this.write(
      () => {
        this.entries[entry.id] = entry;
        for (const row of done) this.sms[row.id] = row;
      },
      async () => {
        await upsertEntry(entry);
        if (done.length > 0) await setSmsStatus(done.map((row) => row.sms_key), "done");
      },
      "지출 추가 실패",
    );
  }

  /** 문자에서 가져온 여러 건을 한 번에 저장한다. 하나라도 실패하면 전부 되돌아간다. */
  addEntries(inputs: readonly NewEntry[]): Promise<boolean> {
    const added = inputs.map((input) => this.#newEntry(input));
    if (added.length === 0) return Promise.resolve(true);
    const done = this.#doneRows(added.map((entry) => entry.sms_key));
    return this.write(
      () => {
        for (const entry of added) this.entries[entry.id] = entry;
        for (const row of done) this.sms[row.id] = row;
      },
      async () => {
        await upsertEntries(added);
        if (done.length > 0) await setSmsStatus(done.map((row) => row.sms_key), "done");
      },
      "지출 추가 실패",
    );
  }

  updateEntry(id: string, patch: Partial<Omit<LedgerEntry, "id" | "created_at" | "sms_key">>): Promise<boolean> {
    const current = this.entries[id];
    if (!current) return Promise.resolve(false);
    const next = { ...current, ...patch };
    return this.write(
      () => (this.entries[id] = next),
      () => upsertEntry(next),
      "지출 저장 실패",
    );
  }

  removeEntry(id: string): Promise<boolean> {
    if (!(id in this.entries)) return Promise.resolve(false);
    return this.write(
      () => delete this.entries[id],
      () => deleteEntry(id),
      "지출 삭제 실패",
    );
  }

  addCard(input: NewCard): Promise<boolean> {
    const card: Card = { ...input, id: crypto.randomUUID(), created_at: new Date().toISOString() };
    return this.write(
      () => (this.cards[card.id] = card),
      () => upsertCard(card),
      "카드 추가 실패",
    );
  }

  removeCard(id: string): Promise<boolean> {
    if (!(id in this.cards)) return Promise.resolve(false);
    return this.write(
      () => delete this.cards[id],
      () => deleteCard(id),
      "카드 삭제 실패",
    );
  }

  /** 카드의 견본을 하나 늘린다. 새 모양인지는 domain.newSample 이 가려서 부르는 쪽이 넘긴다. */
  addSample(cardId: string, sample: SmsSample): Promise<boolean> {
    const card = this.cards[cardId];
    if (!card) return Promise.resolve(false);
    const next: Card = { ...card, samples: [...card.samples, sample] };
    return this.write(
      () => (this.cards[card.id] = next),
      () => upsertCard(next),
      "견본 저장 실패",
    );
  }

  /** 분류를 더한다. 이름이 올바른지(비었는지, 겹치는지)는 부르는 쪽이 확인한다. */
  addCategory(name: string): Promise<boolean> {
    if (this.categories.includes(name)) return Promise.resolve(false);
    const position = Math.max(-1, ...Object.values(this.categoryRows).map((row) => row.position)) + 1;
    const row: CategoryRow = { id: crypto.randomUUID(), name, position, created_at: new Date().toISOString() };
    return this.write(
      () => (this.categoryRows[row.id] = row),
      () => upsertCategory(row),
      "분류 추가 실패",
    );
  }

  /** 분류를 선택지에서 뺀다. 그 분류로 적은 이력은 이름 그대로 남는다. 마지막 하나와 예금은 지울 수 없다. */
  removeCategory(name: string): Promise<boolean> {
    if (name === SAVINGS_CATEGORY) return Promise.resolve(false);
    const row = Object.values(this.categoryRows).find((candidate) => candidate.name === name);
    if (!row || Object.keys(this.categoryRows).length <= 1) return Promise.resolve(false);
    return this.write(
      () => delete this.categoryRows[row.id],
      () => deleteCategory(row.id),
      "분류 삭제 실패",
    );
  }

  /**
   * 분류의 순서를 바꾼다. names 는 새 순서의 분류 이름 전체이고, 지금 있는 분류와 이름이 같아야 한다.
   * 선택지(지출 추가), 통계의 칩이 모두 이 순서를 따른다.
   */
  reorderCategories(names: readonly string[]): Promise<boolean> {
    const byName = new Map(Object.values(this.categoryRows).map((row) => [row.name, row]));
    if (names.length !== byName.size || names.some((name) => !byName.has(name))) return Promise.resolve(false);
    const changed = names
      .map((name, position) => ({ ...byName.get(name)!, position }))
      .filter((row) => row.position !== byName.get(row.name)!.position);
    if (changed.length === 0) return Promise.resolve(false);
    return this.write(
      () => {
        for (const row of changed) this.categoryRows[row.id] = row;
      },
      () => upsertCategories(changed),
      "분류 순서 저장 실패",
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
    return this.write(
      () => (this.budgetRows[row.id] = row),
      () => upsertBudgetRule(row),
      "예산 저장 실패",
    );
  }

  /** "이 달부터" 또는 "이 달만" 규칙 하나를 지운다. key 는 "2026-11". */
  removeBudgetRule(scope: Exclude<BudgetScope, "base">, key: string): Promise<boolean> {
    const row = this.#budgetRow(scope, `${key}-01`);
    if (!row) return Promise.resolve(false);
    return this.write(
      () => delete this.budgetRows[row.id],
      () => deleteBudgetRule(row.id),
      "예산 삭제 실패",
    );
  }

  /**
   * 폰에서 읽어 온 문자를 문자함에 쌓는다. 이미 있는 문자와 30일이 지난 문자는 쌓지 않고,
   * 문자함에 남은 30일이 지난 줄은 지운다. 이미 있는 문자의 처리 상태는 그대로다.
   */
  receiveSms(messages: readonly NewSms[], now = new Date()): Promise<boolean> {
    const cutoff = smsCutoff(now);
    const known = new Set(Object.values(this.sms).map((row) => row.sms_key));
    const fresh: SmsRow[] = [];
    for (const message of messages) {
      if (known.has(message.sms_key) || Date.parse(message.received_at) < cutoff) continue;
      known.add(message.sms_key);
      // 모르는 모양의 긴 메시지 한 통이 DB 제약에 걸려 다른 문자까지 못 쌓게 되는 일을 막는다.
      fresh.push({ ...message, body: message.body.slice(0, SMS_BODY_MAX), id: crypto.randomUUID(), status: "pending" });
    }
    const expired = Object.values(this.sms).filter((row) => Date.parse(row.received_at) < cutoff);
    if (fresh.length === 0 && expired.length === 0) return Promise.resolve(true);
    return this.write(
      () => {
        for (const row of expired) delete this.sms[row.id];
        for (const row of fresh) this.sms[row.id] = row;
      },
      async () => {
        // 지우기를 먼저 해서, 쌓기가 실패해도 만료된 문자는 정리된다.
        await deleteSmsBefore(new Date(cutoff).toISOString());
        if (fresh.length > 0) await insertSms(fresh);
      },
      "문자 저장 실패",
    );
  }

  /** 추가하지 않을 문자를 무시로 치운다. 다음 불러오기에서도 처리 필요로 뜨지 않는다. */
  ignoreSms(ids: readonly string[]): Promise<boolean> {
    const rows = ids.map((id) => this.sms[id]).filter((row): row is SmsRow => !!row && row.status === "pending");
    if (rows.length === 0) return Promise.resolve(true);
    return this.write(
      () => {
        for (const row of rows) this.sms[row.id] = { ...row, status: "ignored" };
      },
      () => setSmsStatus(rows.map((row) => row.sms_key), "ignored"),
      "문자 무시 실패",
    );
  }

  /** 무시한 문자를 모두 처리 필요로 되돌린다. */
  resetIgnored(): Promise<boolean> {
    const rows = Object.values(this.sms).filter((row) => row.status === "ignored");
    if (rows.length === 0) return Promise.resolve(true);
    return this.write(
      () => {
        for (const row of rows) this.sms[row.id] = { ...row, status: "pending" };
      },
      () => resetIgnoredSms(),
      "무시 초기화 실패",
    );
  }
}

export const ledger = new LedgerStore();
