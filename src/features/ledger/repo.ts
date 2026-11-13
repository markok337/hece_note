// ledger_* 테이블 접근. Supabase 호출은 이 파일에만 둔다.

import type { RealtimeChannel } from "@supabase/supabase-js";
import type { BudgetRow, Card, CategoryRow, LedgerEntry } from "./domain";
import { supabase } from "../../supabase";

const ENTRY_COLUMNS = "id, spent_on, method, category, amount, memo, sms_key, created_at";
const CARD_COLUMNS = "id, name, sender, samples, created_at";
const CATEGORY_COLUMNS = "id, name, position, created_at";
const BUDGET_COLUMNS = "id, scope, month, amount";

/** 서버 행에서 앱이 쓰는 컬럼만 남긴다. 실시간 알림에는 user_id 같은 컬럼이 섞여 온다. */
export function pickEntry(row: LedgerEntry): LedgerEntry {
  const { id, spent_on, method, category, amount, memo, sms_key, created_at } = row;
  return { id, spent_on, method, category, amount, memo, sms_key, created_at };
}

export function pickCard(row: Card): Card {
  const { id, name, sender, samples, created_at } = row;
  return { id, name, sender, samples, created_at };
}

export function pickCategory(row: CategoryRow): CategoryRow {
  const { id, name, position, created_at } = row;
  return { id, name, position, created_at };
}

export function pickBudget(row: BudgetRow): BudgetRow {
  const { id, scope, month, amount } = row;
  return { id, scope, month, amount };
}

function client() {
  if (!supabase) throw new Error("Supabase 설정이 비어 있다.");
  return supabase;
}

function check(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

export async function fetchEntries(): Promise<LedgerEntry[]> {
  const { data, error } = await client().from("ledger_entries").select(ENTRY_COLUMNS);
  check(error);
  return data as LedgerEntry[];
}

export async function fetchCards(): Promise<Card[]> {
  const { data, error } = await client().from("ledger_cards").select(CARD_COLUMNS);
  check(error);
  return data as Card[];
}

export async function fetchCategories(): Promise<CategoryRow[]> {
  const { data, error } = await client().from("ledger_categories").select(CATEGORY_COLUMNS);
  check(error);
  return data as CategoryRow[];
}

export async function fetchBudgetRules(): Promise<BudgetRow[]> {
  const { data, error } = await client().from("ledger_budget_rules").select(BUDGET_COLUMNS);
  check(error);
  return data as BudgetRow[];
}

export async function fetchDismissed(): Promise<string[]> {
  const { data, error } = await client().from("ledger_dismissed").select("sms_key");
  check(error);
  return (data as Array<{ sms_key: string }>).map((row) => row.sms_key);
}

export async function upsertEntry(entry: LedgerEntry): Promise<void> {
  check((await client().from("ledger_entries").upsert(pickEntry(entry), { onConflict: "id" })).error);
}

export async function upsertEntries(entries: readonly LedgerEntry[]): Promise<void> {
  check((await client().from("ledger_entries").upsert(entries.map(pickEntry), { onConflict: "id" })).error);
}

export async function deleteEntry(id: string): Promise<void> {
  check((await client().from("ledger_entries").delete().eq("id", id)).error);
}

export async function upsertCard(card: Card): Promise<void> {
  check((await client().from("ledger_cards").upsert(pickCard(card), { onConflict: "id" })).error);
}

export async function deleteCard(id: string): Promise<void> {
  check((await client().from("ledger_cards").delete().eq("id", id)).error);
}

export async function upsertCategory(row: CategoryRow): Promise<void> {
  check((await client().from("ledger_categories").upsert(pickCategory(row), { onConflict: "id" })).error);
}

/** 기본 분류를 채운다. 두 기기가 동시에 채워도 이름이 겹치는 행은 건너뛰므로 중복이 생기지 않는다. */
export async function seedCategories(rows: readonly CategoryRow[]): Promise<void> {
  const { error } = await client()
    .from("ledger_categories")
    .upsert(rows.map(pickCategory), { onConflict: "user_id,name", ignoreDuplicates: true });
  check(error);
}

export async function deleteCategory(id: string): Promise<void> {
  check((await client().from("ledger_categories").delete().eq("id", id)).error);
}

export async function upsertBudgetRule(row: BudgetRow): Promise<void> {
  check((await client().from("ledger_budget_rules").upsert(pickBudget(row), { onConflict: "id" })).error);
}

export async function deleteBudgetRule(id: string): Promise<void> {
  check((await client().from("ledger_budget_rules").delete().eq("id", id)).error);
}

export async function insertDismissed(keys: readonly string[]): Promise<void> {
  const { error } = await client()
    .from("ledger_dismissed")
    .upsert(keys.map((sms_key) => ({ sms_key })), { onConflict: "user_id,sms_key", ignoreDuplicates: true });
  check(error);
}

export interface RowChange<T> {
  kind: "upsert" | "delete";
  id: string;
  row?: T;
}

export interface LedgerHandlers {
  onEntry: (change: RowChange<LedgerEntry>) => void;
  onCard: (change: RowChange<Card>) => void;
  onCategory: (change: RowChange<CategoryRow>) => void;
  onBudget: (change: RowChange<BudgetRow>) => void;
  /** 확인한 문자는 지우는 일이 없어 추가만 알린다. */
  onDismissed: (smsKey: string) => void;
  onStatus: (isLive: boolean) => void;
}

/** 실시간 알림 하나를 앱의 변경 모양으로 바꾼다. 지운 알림에는 기본키(id)만 온다. */
function toChange<T extends { id: string }>(
  payload: { eventType: string; new: unknown; old: unknown },
  pick: (row: T) => T,
): RowChange<T> | null {
  if (payload.eventType === "DELETE") {
    const old = payload.old as Partial<T>;
    return old.id ? { kind: "delete", id: old.id } : null;
  }
  const row = pick(payload.new as T);
  return { kind: "upsert", id: row.id, row };
}

/** 다른 기기의 변경을 받는다. 상태 콜백은 연결/끊김마다 불린다. */
export function subscribeLedger(handlers: LedgerHandlers): RealtimeChannel {
  const channel = client().channel("ledger_feed");
  const watch = <T extends { id: string }>(table: string, pick: (row: T) => T, emit: (change: RowChange<T>) => void) =>
    channel.on("postgres_changes", { event: "*", schema: "public", table }, (payload) => {
      const change = toChange<T>(payload, pick);
      if (change) emit(change);
    });
  watch("ledger_entries", pickEntry, handlers.onEntry);
  watch("ledger_cards", pickCard, handlers.onCard);
  watch("ledger_categories", pickCategory, handlers.onCategory);
  watch("ledger_budget_rules", pickBudget, handlers.onBudget);
  channel.on("postgres_changes", { event: "INSERT", schema: "public", table: "ledger_dismissed" }, (payload) => {
    const row = payload.new as { sms_key?: string };
    if (row.sms_key) handlers.onDismissed(row.sms_key);
  });
  return channel.subscribe((status) => handlers.onStatus(status === "SUBSCRIBED"));
}

export async function unsubscribe(channel: RealtimeChannel): Promise<void> {
  await client().removeChannel(channel);
}
