// 블로그 스케줄 규칙. 화면·DB와 무관한 순수 함수만 둔다.
// 규칙의 원본은 docs/decisions.md 의 "확정한 것: 블로그 스케줄 달력".

import { dayNumber } from "./dates";

export const CATEGORIES = ["레시피,제품", "뷰티", "맛집,여행"] as const;
export type Category = (typeof CATEGORIES)[number];

export const ASSIGNEES = ["행이", "챙이"] as const;
export type Assignee = (typeof ASSIGNEES)[number];

/** 사진 → 글작성 → 글보정 → 연관글 → 예약. 이 순서가 곧 잠금 순서다. */
export const CHECKS = ["photo", "writing", "editing", "related", "reserved"] as const;
export type CheckKey = (typeof CHECKS)[number];

export const CHECK_LABELS: Record<CheckKey, string> = {
  photo: "사진촬영",
  writing: "글작성",
  editing: "글보정",
  related: "연관글",
  reserved: "예약",
};

export interface BlogDay {
  day: string;
  category: Category;
  assignee: Assignee | null;
  topic: string | null;
  photo: boolean;
  writing: boolean;
  editing: boolean;
  related: boolean;
  reserved: boolean;
}

export interface CategoryRule {
  effective_from: string;
  anchor_day: string;
  cycle: Category[];
}

export type CellColor = "white" | "gray" | "blue" | "pink";

const mod = (n: number, m: number) => ((n % m) + m) % m;

/** 규칙 이력에서 해당 날짜에 적용되는 기본 분야를 계산한다. 규칙이 없으면 null. */
export function defaultCategory(day: string, rules: readonly CategoryRule[]): Category | null {
  const applicable = rules
    .filter((rule) => rule.effective_from <= day)
    .reduce<CategoryRule | null>(
      (best, rule) => (best === null || rule.effective_from > best.effective_from ? rule : best),
      null,
    );
  if (applicable === null || applicable.cycle.length === 0) return null;
  const offset = dayNumber(day) - dayNumber(applicable.anchor_day);
  return applicable.cycle[mod(offset, applicable.cycle.length)];
}

export function emptyDay(day: string, category: Category): BlogDay {
  return {
    day,
    category,
    assignee: null,
    topic: null,
    photo: false,
    writing: false,
    editing: false,
    related: false,
    reserved: false,
  };
}

/** 담당·주제·체크가 하나라도 있으면 "내용 있는 날"이다. */
export function hasContent(item: BlogDay): boolean {
  return item.assignee !== null || item.topic !== null || CHECKS.some((key) => item[key]);
}

/** 잠금 규칙을 어기면 이유를, 지키면 null을 돌려준다. DB 제약과 같은 내용이다. */
export function validate(item: BlogDay): string | null {
  if (item.topic !== null && item.assignee === null) return "담당을 먼저 고른다.";
  if (item.photo && item.topic === null) return "주제를 먼저 적는다.";
  const order = CHECKS;
  for (let i = 1; i < order.length; i += 1) {
    if (item[order[i]] && !item[order[i - 1]]) {
      return `${CHECK_LABELS[order[i - 1]]}을(를) 먼저 체크한다.`;
    }
  }
  return null;
}

/** 체크 항목을 바꿀 수 있는지. 못 바꾸면 이유를 돌려준다. */
export function checkToggleBlock(item: BlogDay, key: CheckKey): string | null {
  const index = CHECKS.indexOf(key);
  if (!item[key]) {
    if (index === 0) return item.topic === null ? "주제를 먼저 적는다." : null;
    const prev = CHECKS[index - 1];
    return item[prev] ? null : `${CHECK_LABELS[prev]}을(를) 먼저 체크한다.`;
  }
  const next = CHECKS[index + 1];
  return next && item[next] ? `${CHECK_LABELS[next]}을(를) 먼저 해제한다.` : null;
}

/** 담당을 비울 수 있는지. 주제가 있으면 비울 수 없다. */
export function assigneeClearBlock(item: BlogDay): string | null {
  return item.topic === null ? null : "주제를 먼저 지운다.";
}

/** 주제를 지울 수 있는지. 사진이 체크돼 있으면 지울 수 없다. */
export function topicClearBlock(item: BlogDay): string | null {
  return item.photo ? "사진촬영을 먼저 해제한다." : null;
}

/** 칸 색. 예약(회색) > 글보정 > 글작성 > 담당 > 분야만(흰색). 칸은 항상 한 가지 색이다. */
export function cellColor(item: BlogDay | null): CellColor {
  if (item === null) return "white";
  if (item.reserved) return "gray";
  if (item.editing) return "blue";
  if (item.writing) return "pink";
  if (item.assignee === "행이") return "blue";
  if (item.assignee === "챙이") return "pink";
  return "white";
}

/** 칸이 좁아서 단계 이름을 두 글자로 줄인 것. */
const STEP_SHORT_LABELS: Record<CheckKey, string> = {
  photo: "촬영",
  writing: "작성",
  editing: "보정",
  related: "연관",
  reserved: "예약",
};

/** 지금 해야 할 다음 단계의 짧은 이름. 시작도 안 한 날짜와 모두 끝난 날짜는 null. */
export function nextStep(item: BlogDay): string | null {
  if (!hasContent(item)) return null;
  if (item.assignee === null) return "담당";
  if (item.topic === null) return "주제";
  const pending = CHECKS.find((key) => !item[key]);
  return pending ? STEP_SHORT_LABELS[pending] : null;
}

/** 칸에 붙이는 글자. 하늘색은 "행이", 분홍은 "챙이"다. 담당이 아니라 지금 칸 색을 따른다. */
export function colorLabel(color: CellColor): string {
  if (color === "blue") return "행이";
  if (color === "pink") return "챙이";
  return "";
}

/** 날짜 이동이 가능한지. 불가능하면 이유를 돌려준다. */
export function moveBlock(from: BlogDay | null, to: BlogDay | null): string | null {
  if (from === null || !hasContent(from)) return "옮길 내용이 없다.";
  if (to !== null && to.topic !== null) return "도착 날짜에 주제가 있어 옮길 수 없다.";
  return null;
}

/** 이동 결과: 도착 날짜는 옮긴 아이템, 출발 날짜는 분야만 남은 빈 아이템. */
export function applyMove(from: BlogDay, toDay: string): { moved: BlogDay; vacated: BlogDay } {
  return {
    moved: { ...from, day: toDay },
    vacated: emptyDay(from.day, from.category),
  };
}
