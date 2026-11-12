// 냉장고 규칙: 칸 구성, 재료 정렬, 개수 증감. 화면과 서버를 모르는 순수 함수만 둔다.

import { parseYmd } from "../../core/dates";

export const COMPARTMENTS = ["fridge_fresh", "fridge_sauce", "freezer_ingredient", "freezer_mealkit"] as const;
export type Compartment = (typeof COMPARTMENTS)[number];

export interface Zone {
  id: "fridge" | "freezer";
  label: string;
  compartments: readonly [Compartment, Compartment];
}

/** 메인 화면의 위(냉장고)·아래(냉동고) 구역과, 구역 안의 왼쪽·오른쪽 칸. */
export const ZONES: readonly Zone[] = [
  { id: "fridge", label: "냉장고", compartments: ["fridge_fresh", "fridge_sauce"] },
  { id: "freezer", label: "냉동고", compartments: ["freezer_ingredient", "freezer_mealkit"] },
];

export const COMPARTMENT_LABELS: Record<Compartment, string> = {
  fridge_fresh: "신선",
  fridge_sauce: "양념",
  freezer_ingredient: "재료",
  freezer_mealkit: "밀키트",
};

/** "냉장고 · 신선" 꼴의 칸 제목. */
export function compartmentTitle(compartment: Compartment): string {
  const zone = ZONES.find((z) => z.compartments.includes(compartment))!;
  return `${zone.label} · ${COMPARTMENT_LABELS[compartment]}`;
}

export const MAX_QUANTITY = 999;
export const NAME_MAX = 40;

export interface FridgeItem {
  id: string;
  compartment: Compartment;
  name: string;
  /** 추가된 날짜. 시간 없이 "2026-11-08" 꼴. */
  added_on: string;
  /** null 이면 개수 없음. 값이 있으면 1 이상의 정수. */
  quantity: number | null;
  created_at: string;
}

export interface ShoppingItem {
  id: string;
  name: string;
  checked: boolean;
  created_at: string;
}

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** 서버가 돌려주는 시각 문자열과 내가 만든 시각 문자열의 모양이 달라서, 시각 값으로 바꿔 비교한다. */
function compareCreated(a: { created_at: string; id: string }, b: { created_at: string; id: string }): number {
  return Date.parse(a.created_at) - Date.parse(b.created_at) || compareText(a.id, b.id);
}

/** 오래된 재료가 먼저. 날짜가 같으면 먼저 넣은 재료가 앞이다. 개수가 있든 없든 같은 기준이다. */
export function sortOldestFirst(items: readonly FridgeItem[]): FridgeItem[] {
  return [...items].sort((a, b) => compareText(a.added_on, b.added_on) || compareCreated(a, b));
}

/** 체크 안 한 항목이 먼저, 체크한 항목은 아래. 각각 먼저 적은 순서. */
export function sortShopping(items: readonly ShoppingItem[]): ShoppingItem[] {
  return [...items].sort((a, b) => Number(a.checked) - Number(b.checked) || compareCreated(a, b));
}

/** 이름이 쓸 수 있는 값이면 null, 아니면 이유. */
export function validateName(raw: string, label = "이름"): string | null {
  const name = raw.trim();
  if (name === "") return `${label}을(를) 적는다.`;
  if (name.length > NAME_MAX) return `${label}은(는) ${NAME_MAX}자까지 쓴다.`;
  return null;
}

export type QuantityParse = { ok: true; value: number | null } | { ok: false; reason: string };

/** 입력칸 글자를 개수로 바꾼다. 비어 있으면 "개수 없음"(null)이고, 1 이상의 정수만 받는다. */
export function parseQuantity(raw: string): QuantityParse {
  const text = raw.trim();
  if (text === "") return { ok: true, value: null };
  if (!/^\d+$/.test(text)) return { ok: false, reason: "개수는 1 이상의 정수만 쓸 수 있다." };
  const value = Number(text);
  if (value < 1) return { ok: false, reason: "개수는 1 이상의 정수만 쓸 수 있다." };
  if (value > MAX_QUANTITY) return { ok: false, reason: `개수는 ${MAX_QUANTITY}까지 쓸 수 있다.` };
  return { ok: true, value };
}

/** 늘리기. 개수가 없던 재료는 1이 된다. */
export function increase(quantity: number | null): number {
  return quantity === null ? 1 : Math.min(quantity + 1, MAX_QUANTITY);
}

/** 줄이기. 1에서 줄이면 개수 없음이 된다. 개수 없음은 그대로다. */
export function decrease(quantity: number | null): number | null {
  return quantity === null || quantity <= 1 ? null : quantity - 1;
}

/** 칸에 줄이 capacity 개 들어갈 때 보여줄 재료와 숨긴 개수. 넘치면 마지막 줄을 "+N개" 자리로 비운다. */
export function visibleSlice<T>(items: readonly T[], capacity: number): { shown: T[]; hidden: number } {
  if (items.length <= capacity) return { shown: [...items], hidden: 0 };
  const shown = items.slice(0, Math.max(capacity - 1, 0));
  return { shown, hidden: items.length - shown.length };
}

/** 칸에 붙는 짧은 날짜. 올해는 "11/8", 다른 해는 "25/11/8". */
export function shortDate(ymd: string, today: string): string {
  const { year, month, day } = parseYmd(ymd);
  const md = `${month}/${day}`;
  return year === parseYmd(today).year ? md : `${String(year).slice(-2)}/${md}`;
}
