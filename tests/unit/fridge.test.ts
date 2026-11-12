import { describe, expect, it } from "vitest";
import {
  MAX_QUANTITY,
  decrease,
  increase,
  parseQuantity,
  shortDate,
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

describe("shortDate", () => {
  it("올해는 월/일만 쓴다", () => {
    expect(shortDate("2026-11-08", "2026-11-13")).toBe("11/8");
  });

  it("다른 해는 연도 두 자리를 앞에 붙인다", () => {
    expect(shortDate("2025-03-01", "2026-11-13")).toBe("25/3/1");
  });
});
