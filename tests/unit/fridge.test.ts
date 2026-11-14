import { describe, expect, it } from "vitest";
import {
  COMPARTMENTS,
  MAX_QUANTITY,
  MEAL_MAX,
  ZONES,
  compartmentTitle,
  isEmptyMeal,
  validateMeal,
  decrease,
  increase,
  parseQuantity,
  compactDate,
  daysSince,
  elapsedLabel,
  sortOldestFirst,
  sortShopping,
  validateName,
  visibleSlice,
  type FridgeItem,
  type ShoppingItem,
} from "../../src/features/fridge/domain";

function item(id: string, added_on: string, created_at = "2026-11-01T00:00:00Z", quantity: number | null = null): FridgeItem {
  return { id, compartment: "fridge_fresh", name: id, added_on, quantity, created_at };
}

describe("sortOldestFirst", () => {
  it("추가된 날짜가 오래된 재료가 먼저다", () => {
    const sorted = sortOldestFirst([item("b", "2026-11-10"), item("a", "2026-11-02")]);
    expect(sorted.map((i) => i.id)).toEqual(["a", "b"]);
  });

  it("날짜가 같으면 먼저 넣은 재료가 앞이다", () => {
    const sorted = sortOldestFirst([
      item("late", "2026-11-02", "2026-11-05T10:00:00.000Z"),
      item("early", "2026-11-02", "2026-11-05T09:00:00.123456+00:00"),
    ]);
    expect(sorted.map((i) => i.id)).toEqual(["early", "late"]);
  });

  it("개수 유무는 순서에 영향이 없다", () => {
    const sorted = sortOldestFirst([item("n", "2026-11-03", undefined, 5), item("m", "2026-11-01")]);
    expect(sorted.map((i) => i.id)).toEqual(["m", "n"]);
  });

  it("원본 배열을 바꾸지 않는다", () => {
    const input = [item("b", "2026-11-10"), item("a", "2026-11-02")];
    sortOldestFirst(input);
    expect(input.map((i) => i.id)).toEqual(["b", "a"]);
  });
});

describe("sortShopping", () => {
  it("체크 안 한 항목이 먼저고, 각각 먼저 적은 순서다", () => {
    const make = (id: string, checked: boolean, created_at: string): ShoppingItem => ({ id, name: id, checked, created_at });
    const sorted = sortShopping([
      make("done1", true, "2026-11-01T00:00:00Z"),
      make("todo2", false, "2026-11-03T00:00:00Z"),
      make("todo1", false, "2026-11-02T00:00:00Z"),
    ]);
    expect(sorted.map((i) => i.id)).toEqual(["todo1", "todo2", "done1"]);
  });
});

describe("parseQuantity", () => {
  it("빈 입력은 개수 없음이다", () => {
    expect(parseQuantity("  ")).toEqual({ ok: true, value: null });
  });

  it("1 이상의 정수를 받는다", () => {
    expect(parseQuantity("3")).toEqual({ ok: true, value: 3 });
    expect(parseQuantity(String(MAX_QUANTITY))).toEqual({ ok: true, value: MAX_QUANTITY });
  });

  it.each(["0", "-2", "1.5", "abc", "1e3", String(MAX_QUANTITY + 1)])("%s 는 거절한다", (raw) => {
    expect(parseQuantity(raw).ok).toBe(false);
  });
});

describe("increase / decrease", () => {
  it("개수 없음에서 늘리면 1이다", () => {
    expect(increase(null)).toBe(1);
  });

  it("상한을 넘기지 않는다", () => {
    expect(increase(MAX_QUANTITY)).toBe(MAX_QUANTITY);
  });

  it("1에서 줄이면 개수 없음이 된다", () => {
    expect(decrease(1)).toBeNull();
  });

  it("개수 없음에서 줄여도 개수 없음이다", () => {
    expect(decrease(null)).toBeNull();
  });

  it("2 이상이면 1씩 줄어든다", () => {
    expect(decrease(5)).toBe(4);
  });
});

describe("validateName", () => {
  it("공백뿐이면 거절한다", () => {
    expect(validateName("   ")).not.toBeNull();
  });

  it("40자를 넘으면 거절한다", () => {
    expect(validateName("가".repeat(41))).not.toBeNull();
    expect(validateName("가".repeat(40))).toBeNull();
  });
});

describe("visibleSlice", () => {
  it("다 들어가면 전부 보여준다", () => {
    expect(visibleSlice([1, 2, 3], 3)).toEqual({ shown: [1, 2, 3], hidden: 0 });
  });

  it("넘치면 마지막 줄을 '+N개' 자리로 비운다", () => {
    expect(visibleSlice([1, 2, 3, 4, 5], 3)).toEqual({ shown: [1, 2], hidden: 3 });
  });

  it("줄이 하나도 안 들어가면 전부 숨긴다", () => {
    expect(visibleSlice([1, 2], 0)).toEqual({ shown: [], hidden: 2 });
  });
});

describe("compactDate", () => {
  it("연도 두 자리를 항상 붙인다", () => {
    expect(compactDate("2026-11-08")).toBe("26/11/8");
    expect(compactDate("2025-03-01")).toBe("25/3/1");
  });
});

describe("daysSince / elapsedLabel", () => {
  it("지난 날수를 센다", () => {
    expect(daysSince("2026-11-08", "2026-11-13")).toBe(5);
  });

  it("해가 바뀌어도 센다", () => {
    expect(daysSince("2025-12-30", "2026-01-02")).toBe(3);
  });

  it("오늘 넣은 재료는 '오늘'이다", () => {
    expect(elapsedLabel("2026-11-13", "2026-11-13")).toBe("오늘");
  });

  it("지난 날은 'N일', 앞으로의 날짜는 'N일 후'다", () => {
    expect(elapsedLabel("2026-11-08", "2026-11-13")).toBe("5일");
    expect(elapsedLabel("2026-11-16", "2026-11-13")).toBe("3일 후");
  });
});

describe("구역과 칸", () => {
  it("모든 칸이 구역 하나에만 들어 있다", () => {
    const placed = ZONES.flatMap((zone) => zone.compartments);
    expect([...placed].sort()).toEqual([...COMPARTMENTS].sort());
  });

  it("실온은 칸이 하나뿐인 구역이다", () => {
    expect(ZONES.find((zone) => zone.id === "pantry")?.compartments).toEqual(["pantry"]);
  });

  it("칸이 둘인 구역은 구역과 칸 이름을 함께 쓴다", () => {
    expect(compartmentTitle("fridge_fresh")).toBe("냉장고 · 신선");
  });

  it("칸이 하나뿐인 구역은 이름을 한 번만 쓴다", () => {
    expect(compartmentTitle("pantry")).toBe("실온 보관");
  });
});

describe("식단 규칙", () => {
  it("빈 글자는 쓸 수 있다(그 끼니를 지우는 뜻)", () => {
    expect(validateMeal("")).toBeNull();
    expect(validateMeal("   ")).toBeNull();
  });

  it("상한까지는 쓸 수 있고 넘으면 막는다", () => {
    expect(validateMeal("가".repeat(MEAL_MAX))).toBeNull();
    expect(validateMeal("가".repeat(MEAL_MAX + 1))).not.toBeNull();
  });

  it("점심·저녁이 모두 비어야 빈 식단이다", () => {
    expect(isEmptyMeal({ lunch: "", dinner: "" })).toBe(true);
    expect(isEmptyMeal({ lunch: "밥", dinner: "" })).toBe(false);
    expect(isEmptyMeal({ lunch: "", dinner: "국" })).toBe(false);
  });
});
