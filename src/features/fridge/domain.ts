// 냉장고 규칙: 칸 구성, 재료 정렬, 개수 증감. 화면과 서버를 모르는 순수 함수만 둔다.

import { dayNumber, parseYmd } from "../../core/dates";

export const COMPARTMENTS = ["fridge_fresh", "fridge_sauce", "freezer_ingredient", "freezer_mealkit", "pantry"] as const;
export type Compartment = (typeof COMPARTMENTS)[number];

export interface Zone {
  id: "fridge" | "freezer" | "pantry";
  label: string;
  /** 구역 안의 칸. 냉장고·냉동고는 둘, 실온은 하나다. */
  compartments: readonly Compartment[];
}

/** 메인 화면의 위(냉장고)·가운데(냉동고)·아래(실온) 구역과, 구역 안의 왼쪽·오른쪽 칸. */
export const ZONES: readonly Zone[] = [
  { id: "fridge", label: "냉장고", compartments: ["fridge_fresh", "fridge_sauce"] },
  { id: "freezer", label: "냉동고", compartments: ["freezer_ingredient", "freezer_mealkit"] },
  { id: "pantry", label: "실온", compartments: ["pantry"] },
];

export const COMPARTMENT_LABELS: Record<Compartment, string> = {
  fridge_fresh: "신선",
  fridge_sauce: "양념",
  freezer_ingredient: "재료",
  freezer_mealkit: "밀키트",
  pantry: "실온 보관",
};

/** "냉장고 · 신선" 꼴의 칸 제목. 구역에 칸이 하나뿐이면 칸 이름이 곧 구역 이름이라 한 번만 쓴다. */
export function compartmentTitle(compartment: Compartment): string {
  const zone = ZONES.find((z) => z.compartments.includes(compartment))!;
  if (zone.compartments.length === 1) return COMPARTMENT_LABELS[compartment];
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

/** 하루 식단. 점심·저녁이 모두 비면 행을 두지 않는다. 냉장고 재료와는 이어지지 않는 자유 메모다. */
export interface Meal {
  /** "2026-11-08" 꼴. */
  day: string;
  lunch: string;
  dinner: string;
}

export const MEAL_SLOTS = ["lunch", "dinner"] as const;
export type MealSlot = (typeof MEAL_SLOTS)[number];

export const MEAL_LABELS: Record<MealSlot, string> = { lunch: "점심", dinner: "저녁" };

export const MEAL_MAX = 40;

/** 식단 글자가 쓸 수 있는 값이면 null, 아니면 이유. 비워 두는 것(그 끼니를 지움)은 쓸 수 있다. */
export function validateMeal(raw: string): string | null {
  return raw.trim().length > MEAL_MAX ? `식단은 ${MEAL_MAX}자까지 쓴다.` : null;
}

/** 점심·저녁이 둘 다 비었는지. */
export function isEmptyMeal(meal: Pick<Meal, "lunch" | "dinner">): boolean {
  return meal.lunch === "" && meal.dinner === "";
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

/** 칸에 붙는 짧은 날짜. 연도 두 자리를 항상 붙인다. 예: "26/11/8". */
export function compactDate(ymd: string): string {
  const { year, month, day } = parseYmd(ymd);
  return `${String(year).slice(-2)}/${month}/${day}`;
}

/** 추가된 날부터 오늘까지 지난 날수. 오늘 넣었으면 0, 앞으로의 날짜면 음수. */
export function daysSince(ymd: string, today: string): number {
  return dayNumber(today) - dayNumber(ymd);
}

/** 지난 날수를 글자로. "오늘", "5일", 앞으로의 날짜는 "3일 후". */
export function elapsedLabel(ymd: string, today: string): string {
  const days = daysSince(ymd, today);
  if (days === 0) return "오늘";
  return days > 0 ? `${days}일` : `${-days}일 후`;
}
