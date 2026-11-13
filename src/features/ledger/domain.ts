// 가계부 규칙: 분류·구분, 입력값 검사, 날짜별 묶음과 월 통계. 화면과 서버를 모르는 순수 함수만 둔다.

import { parseYmd, shiftMonth, toYmd, weekday, type MonthRef } from "../../core/dates";

/** 구분의 기본값. 나머지 구분은 사용자가 등록한 카드 이름이다. */
export const CASH = "현금";

/** 분류는 사용자가 설정 탭에서 더하고 뺀다. 처음에는 이 목록이다. */
export const DEFAULT_CATEGORIES: readonly string[] = ["식비", "교통", "쇼핑", "생활", "의료", "문화", "기타"];
export type Category = string;

/**
 * 지출이 아닌 저축이라 합계에 넣지 않는 분류. 설정에서 지울 수 없다.
 * 합계(월 합계, 예산 차액, 하루 합계, 통계의 "전체")에서 빠지고, 항목은 목록에 그대로 보인다.
 */
export const SAVINGS_CATEGORY = "예금";

/** 합계에 들어가는 항목인가. */
export function isCounted(entry: Pick<LedgerEntry, "category">): boolean {
  return entry.category !== SAVINGS_CATEGORY;
}

export const CATEGORY_NAME_MAX = 10;
export const MEMO_MAX = 100;
export const CARD_NAME_MAX = 20;
export const AMOUNT_MAX = 1_000_000_000;

export interface LedgerEntry {
  id: string;
  /** 쓴 날짜. 시간 없이 "2026-11-13" 꼴. */
  spent_on: string;
  /** 현금이거나 등록한 카드 이름. */
  method: string;
  category: Category;
  /** 원 단위 정수. 승인 취소·환불은 음수. */
  amount: number;
  memo: string;
  /** 문자에서 가져온 항목의 문자 식별값. 같은 문자를 두 번 가져오지 않는 데 쓴다. 직접 적은 항목은 null. */
  sms_key: string | null;
  created_at: string;
}

export interface Card {
  id: string;
  name: string;
  /** 결제 문자를 보내는 번호. 숫자만. */
  sender: string;
  /** 이 번호로 온 문자의 모양을 알려 주는 견본. 결제·취소처럼 종류마다 하나씩. */
  samples: string[];
  created_at: string;
}

/** 분류 목록의 한 줄. position 이 선택지의 순서다. */
export interface CategoryRow {
  id: string;
  name: string;
  position: number;
  created_at: string;
}

/** 예산 규칙의 한 줄. base 는 month 가 없고, from·only 는 그 달 1일("2026-11-01")이다. */
export interface BudgetRow {
  id: string;
  scope: BudgetScope;
  month: string | null;
  amount: number;
}

/** 문자에서 읽어 낸 결제 한 건. 사용자가 확인하기 전까지는 항목이 아니다. */
export interface SmsCandidate {
  key: string;
  spent_on: string;
  method: string;
  merchant: string;
  /** 승인은 양수, 취소는 음수. */
  amount: number;
  category: Category;
}

/** 읽지 못한 문자. 조용히 버리지 않고 목록으로 보여 준다. */
export interface SmsUnparsed {
  key: string;
  method: string;
  raw: string;
}

export type Parsed<T> = { ok: true; value: T } | { ok: false; reason: string };

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** "12,000", "-3500" 같은 글자를 금액으로 바꾼다. 0 은 받지 않는다. */
export function parseAmount(raw: string): Parsed<number> {
  const text = raw.replace(/[,\s원]/g, "");
  if (!/^-?\d+$/.test(text)) return { ok: false, reason: "금액은 숫자로 적는다." };
  const value = Number(text);
  if (value === 0) return { ok: false, reason: "금액은 0이 될 수 없다." };
  if (Math.abs(value) > AMOUNT_MAX) return { ok: false, reason: "금액이 너무 크다." };
  return { ok: true, value };
}

export function validateMemo(raw: string): string | null {
  return raw.trim().length > MEMO_MAX ? `메모는 ${MEMO_MAX}자까지 쓴다.` : null;
}

/** 새 항목의 분류 기본값. "기타"가 있으면 그것, 없으면 첫 분류. */
export function defaultCategory(categories: readonly string[]): Category {
  return categories.includes("기타") ? "기타" : (categories[0] ?? "기타");
}

export function validateCategoryName(raw: string, existing: readonly string[]): string | null {
  const name = raw.trim();
  if (name === "") return "분류 이름을 적는다.";
  if (name.length > CATEGORY_NAME_MAX) return `분류 이름은 ${CATEGORY_NAME_MAX}자까지 쓴다.`;
  if (existing.includes(name)) return "이미 있는 분류다.";
  return null;
}

export function validateCardName(raw: string, existing: readonly Card[]): string | null {
  const name = raw.trim();
  if (name === "") return "카드 이름을 적는다.";
  if (name.length > CARD_NAME_MAX) return `카드 이름은 ${CARD_NAME_MAX}자까지 쓴다.`;
  if (name === CASH || existing.some((card) => card.name === name)) return "이미 있는 이름이다.";
  return null;
}

/** "1588-8700" 을 숫자만 남긴 "15888700" 으로 바꾼다. */
export function parseSender(raw: string, existing: readonly Card[]): Parsed<string> {
  const digits = raw.replace(/[\s-]/g, "");
  if (!/^\d{3,15}$/.test(digits)) return { ok: false, reason: "발신번호는 숫자 3~15자리로 적는다." };
  if (existing.some((card) => card.sender === digits)) return { ok: false, reason: "이미 등록된 번호다." };
  return { ok: true, value: digits };
}

/** 견본 입력칸의 글자를 빈 줄 기준으로 나눠 문자 하나씩의 목록으로 만든다. */
export function splitSamples(raw: string): string[] {
  return raw
    .split(/\n\s*\n/)
    .map((sample) => sample.trim())
    .filter((sample) => sample !== "");
}

/** 새 항목이 위로 오는 순서. 날짜가 같으면 나중에 넣은 항목이 위다. */
export function sortNewestFirst(entries: readonly LedgerEntry[]): LedgerEntry[] {
  return [...entries].sort(
    (a, b) =>
      compareText(b.spent_on, a.spent_on) || Date.parse(b.created_at) - Date.parse(a.created_at) || compareText(b.id, a.id),
  );
}

/** "2026-11" 꼴의 달 식별값. 날짜 앞부분과 같아서 글자 비교로 달 순서를 알 수 있다. */
export function monthKey(ref: MonthRef): string {
  return toYmd(ref.year, ref.month, 1).slice(0, 7);
}

/** "2026-11" 을 "2026년 11월" 로. */
export function monthKeyLabel(key: string): string {
  return `${key.slice(0, 4)}년 ${Number(key.slice(5))}월`;
}

export function entriesInMonth(entries: readonly LedgerEntry[], ref: MonthRef): LedgerEntry[] {
  const key = monthKey(ref);
  return entries.filter((entry) => entry.spent_on.startsWith(key));
}

/** 통계에서 눌러 이력을 볼 수 있는 묶음의 종류. */
export type SliceKind = "category" | "method";

/** 한 분류(또는 한 구분)에 속한 항목만 남긴다. */
export function entriesBy(entries: readonly LedgerEntry[], kind: SliceKind, label: string): LedgerEntry[] {
  return entries.filter((entry) => (kind === "category" ? entry.category : entry.method) === label);
}

/**
 * 예산 규칙. 한 달의 예산은 다음 순서로 정해진다.
 * 1) 그 달만(only) 정한 값, 2) 그 달 이전에 "이 달부터"(from) 정한 것 중 가장 최근 값, 3) 기본값(base).
 */
export interface BudgetRules {
  base: number | null;
  /** "이 달부터 기본값 변경". 키는 "2026-11". 다음 변경까지 이어진다. */
  from: Record<string, number>;
  /** "이 달만 변경". 키는 "2026-11". */
  only: Record<string, number>;
}

export type BudgetScope = "base" | "from" | "only";

export function emptyBudgetRules(): BudgetRules {
  return { base: null, from: {}, only: {} };
}

/** 그 달에 적용되는 예산. 정한 적이 없으면 null. */
export function budgetFor(rules: Readonly<BudgetRules>, ref: MonthRef): number | null {
  const key = monthKey(ref);
  if (key in rules.only) return rules.only[key];
  const latest = Object.keys(rules.from)
    .filter((month) => month <= key)
    .sort()
    .at(-1);
  return latest === undefined ? rules.base : rules.from[latest];
}

/** "1,000,000원" 같은 글자를 예산으로 바꾼다. 0 이하는 받지 않는다. */
export function parseBudget(raw: string): Parsed<number> {
  const text = raw.replace(/[,\s원]/g, "");
  if (!/^\d+$/.test(text)) return { ok: false, reason: "예산은 숫자로 적는다." };
  const value = Number(text);
  if (value === 0) return { ok: false, reason: "예산은 0보다 커야 한다." };
  if (value > AMOUNT_MAX) return { ok: false, reason: "예산이 너무 크다." };
  return { ok: true, value };
}

export interface BudgetStatus {
  budget: number;
  spent: number;
  /** 예산에서 지출을 뺀 값. 음수면 초과한 금액이다. */
  remaining: number;
  over: boolean;
  /** 예산 대비 지출 비율 0~1. 초과해도 1에서 멈춘다. */
  ratio: number;
}

export function budgetStatus(spent: number, budget: number): BudgetStatus {
  const remaining = budget - spent;
  return { budget, spent, remaining, over: remaining < 0, ratio: Math.min(Math.max(spent, 0) / budget, 1) };
}

export interface DayGroup {
  date: string;
  entries: LedgerEntry[];
  total: number;
}

/** 날짜별로 묶는다. 최근 날짜가 위, 같은 날 안에서도 최근 항목이 위. */
export function groupByDate(entries: readonly LedgerEntry[]): DayGroup[] {
  const groups: DayGroup[] = [];
  for (const entry of sortNewestFirst(entries)) {
    const counted = isCounted(entry) ? entry.amount : 0;
    const last = groups[groups.length - 1];
    if (last && last.date === entry.spent_on) {
      last.entries.push(entry);
      last.total += counted;
    } else {
      groups.push({ date: entry.spent_on, entries: [entry], total: counted });
    }
  }
  return groups;
}

const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"] as const;

/** "11월 13일 (금)" 꼴의 날짜 제목. */
export function dayLabel(ymd: string): string {
  const { month, day } = parseYmd(ymd);
  return `${month}월 ${day}일 (${WEEKDAY_LABELS[weekday(ymd)]})`;
}

/** "12,000원", 음수는 "-3,500원". */
export function formatWon(amount: number): string {
  return `${amount.toLocaleString("ko-KR")}원`;
}

export interface Slice {
  label: string;
  total: number;
  /** 지출(양수) 합계 대비 비율 0~1. 합계가 0 이하인 묶음은 0. */
  share: number;
}

export interface MonthStats {
  total: number;
  count: number;
  /** 지난달 합계. 지난달 항목이 없으면 null. */
  previousTotal: number | null;
  byCategory: Slice[];
  byMethod: Slice[];
}

function sliceBy(entries: readonly LedgerEntry[], pick: (entry: LedgerEntry) => string): Slice[] {
  const totals = new Map<string, number>();
  for (const entry of entries) totals.set(pick(entry), (totals.get(pick(entry)) ?? 0) + entry.amount);
  const spending = [...totals.values()].reduce((sum, value) => sum + Math.max(value, 0), 0);
  return [...totals]
    .map(([label, total]) => ({ label, total, share: spending > 0 ? Math.max(total, 0) / spending : 0 }))
    .sort((a, b) => b.total - a.total || compareText(a.label, b.label));
}

/** 한 달의 합계, 지난달 합계, 분류별·구분별 합계. 합계에 넣지 않는 분류(예금)는 모두에서 뺀다. */
export function monthStats(all: readonly LedgerEntry[], ref: MonthRef): MonthStats {
  const counted = all.filter(isCounted);
  const entries = entriesInMonth(counted, ref);
  const previous = entriesInMonth(counted, shiftMonth(ref, -1));
  return {
    total: entries.reduce((sum, entry) => sum + entry.amount, 0),
    count: entries.length,
    previousTotal: previous.length === 0 ? null : previous.reduce((sum, entry) => sum + entry.amount, 0),
    byCategory: sliceBy(entries, (entry) => entry.category),
    byMethod: sliceBy(entries, (entry) => entry.method),
  };
}

/** 추이 그래프가 보여 주는 개월 수. */
export const TREND_MONTHS = 12;

export interface TrendPoint {
  key: string;
  /** "11월" 꼴의 달 이름. */
  label: string;
  total: number;
  /** 바로 앞 달과의 차이. 두 달 모두 0이면 null. */
  delta: number | null;
}

/** 끝 달까지 최근 TREND_MONTHS 개월의 합계. category 가 null 이면 전체 분류다. 오래된 달이 앞이다. */
export function categoryTrend(
  entries: readonly LedgerEntry[],
  end: MonthRef,
  category: string | null,
  months = TREND_MONTHS,
): TrendPoint[] {
  // 전체는 합계와 같은 기준이라 예금을 뺀다. 예금 칩을 직접 고르면 예금의 추이를 본다.
  const scoped = category === null ? entries.filter(isCounted) : entries.filter((entry) => entry.category === category);
  // 첫 달의 전월 대비를 구하려고 한 달 더 센다.
  const refs = Array.from({ length: months + 1 }, (_, i) => shiftMonth(end, i - months));
  const totals = refs.map((ref) => entriesInMonth(scoped, ref).reduce((sum, entry) => sum + entry.amount, 0));
  return refs.slice(1).map((ref, i) => {
    const total = totals[i + 1];
    const previous = totals[i];
    return {
      key: monthKey(ref),
      label: `${ref.month}월`,
      total,
      delta: total === 0 && previous === 0 ? null : total - previous,
    };
  });
}

function trimDecimal(value: number): string {
  return Number(value.toFixed(1)).toString();
}

/** 그래프 위 글자용 짧은 금액. 5600 → "5,600", 56000 → "5.6만", 1234000 → "123.4만". */
export function formatShortWon(amount: number): string {
  const abs = Math.abs(amount);
  const sign = amount < 0 ? "-" : "";
  if (abs >= 100_000_000) return `${sign}${trimDecimal(abs / 100_000_000)}억`;
  if (abs >= 10_000) return `${sign}${trimDecimal(abs / 10_000)}만`;
  return amount.toLocaleString("ko-KR");
}

/** 목록에서 from 자리의 항목을 to 자리로 옮긴 새 목록. 범위를 벗어나면 그대로 돌려준다. */
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  const next = [...list];
  if (from < 0 || from >= next.length || to < 0 || to >= next.length || from === to) return next;
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}
