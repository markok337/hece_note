import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FridgeItem, Meal, ShoppingItem } from "../../src/features/fridge/domain";

const repo = vi.hoisted(() => ({
  fetchItems: vi.fn(),
  fetchShopping: vi.fn(),
  fetchMeals: vi.fn(),
  upsertMeal: vi.fn(),
  deleteMeal: vi.fn(),
  upsertItem: vi.fn(),
  deleteItem: vi.fn(),
  upsertShopping: vi.fn(),
  deleteShopping: vi.fn(),
  deleteCheckedShopping: vi.fn(),
  subscribeFridge: vi.fn(),
  unsubscribe: vi.fn(),
}));
vi.mock("../../src/features/fridge/repo", () => repo);

import { fridge } from "../../src/features/fridge/store.svelte";

function item(id: string, added_on: string, quantity: number | null = null): FridgeItem {
  return { id, compartment: "fridge_fresh", name: id, added_on, quantity, created_at: "2026-11-01T00:00:00Z" };
}

function shop(id: string, checked = false): ShoppingItem {
  return { id, name: id, checked, created_at: `2026-11-0${id.length}T00:00:00Z` };
}

beforeEach(async () => {
  vi.resetAllMocks();
  repo.fetchItems.mockResolvedValue([item("old", "2026-11-01", 2), item("new", "2026-11-09")]);
  repo.fetchShopping.mockResolvedValue([shop("a"), shop("bb", true)]);
  repo.fetchMeals.mockResolvedValue([{ day: "2026-11-14", lunch: "김치찌개", dinner: "" } satisfies Meal]);
  for (const name of ["upsertMeal", "deleteMeal", "upsertItem", "deleteItem", "upsertShopping", "deleteShopping", "deleteCheckedShopping", "unsubscribe"] as const) {
    repo[name].mockResolvedValue(undefined);
  }
  await fridge.stop();
});

describe("불러오기", () => {
  it("불러오기 전에는 쓰지 않는다", async () => {
    const ok = await fridge.addItem({ compartment: "fridge_fresh", name: "당근", added_on: "2026-11-13", quantity: null });
    expect(ok).toBe(false);
    expect(repo.upsertItem).not.toHaveBeenCalled();
  });

  it("칸별로 오래된 재료가 먼저 나온다", async () => {
    await fridge.load();
    expect(fridge.itemsIn("fridge_fresh").map((i) => i.id)).toEqual(["old", "new"]);
    expect(fridge.itemsIn("fridge_sauce")).toEqual([]);
  });

  it("체크 안 한 구매 항목 수를 센다", async () => {
    await fridge.load();
    expect(fridge.toBuy).toBe(1);
  });
});

describe("재료 쓰기", () => {
  beforeEach(async () => {
    await fridge.load();
  });

  it("재료를 더하면 화면에 먼저 들어가고 서버에 보낸다", async () => {
    const pending = fridge.addItem({ compartment: "fridge_sauce", name: "간장", added_on: "2026-11-13", quantity: null });
    expect(fridge.itemsIn("fridge_sauce")).toHaveLength(1);
    expect(await pending).toBe(true);
    expect(repo.upsertItem).toHaveBeenCalledWith(expect.objectContaining({ name: "간장", quantity: null }));
  });

  it("재료를 지운다", async () => {
    await fridge.removeItem("old");
    expect(fridge.itemsIn("fridge_fresh").map((i) => i.id)).toEqual(["new"]);
    expect(repo.deleteItem).toHaveBeenCalledWith("old");
  });

  it("개수를 바꿔 저장한다", async () => {
    await fridge.setQuantity("new", 4);
    expect(fridge.items["new"].quantity).toBe(4);
    expect(repo.upsertItem).toHaveBeenCalledWith(expect.objectContaining({ id: "new", quantity: 4 }));
  });

  it("추가된 날짜를 바꾸면 정렬 순서도 따라간다", async () => {
    await fridge.setAddedOn("new", "2026-10-01");
    expect(fridge.itemsIn("fridge_fresh").map((i) => i.id)).toEqual(["new", "old"]);
    expect(repo.upsertItem).toHaveBeenCalledWith(expect.objectContaining({ id: "new", added_on: "2026-10-01" }));
  });

  it("날짜가 그대로면 저장하지 않는다", async () => {
    expect(await fridge.setAddedOn("old", "2026-11-01")).toBe(false);
    expect(repo.upsertItem).not.toHaveBeenCalled();
  });

  it("개수가 그대로면 저장하지 않는다", async () => {
    expect(await fridge.setQuantity("old", 2)).toBe(false);
    expect(repo.upsertItem).not.toHaveBeenCalled();
  });

  it("개수를 null 로 되돌릴 수 있다", async () => {
    await fridge.setQuantity("old", null);
    expect(fridge.items["old"].quantity).toBeNull();
  });
});

describe("구매목록 쓰기", () => {
  beforeEach(async () => {
    await fridge.load();
  });

  it("항목을 더하고 체크하고 지운다", async () => {
    await fridge.addShopping("우유");
    const added = fridge.shoppingList().find((i) => i.name === "우유")!;
    await fridge.toggleShopping(added.id);
    expect(fridge.shopping[added.id].checked).toBe(true);
    await fridge.removeShopping(added.id);
    expect(fridge.shopping[added.id]).toBeUndefined();
  });

  it("체크한 항목만 한꺼번에 지운다", async () => {
    await fridge.clearChecked();
    expect(Object.keys(fridge.shopping)).toEqual(["a"]);
    expect(repo.deleteCheckedShopping).toHaveBeenCalledTimes(1);
  });

  it("체크한 항목은 목록 아래로 간다", () => {
    expect(fridge.shoppingList().map((i) => i.id)).toEqual(["a", "bb"]);
  });
});

describe("식단 쓰기", () => {
  beforeEach(async () => {
    await fridge.load();
  });

  it("불러온 식단을 날짜로 찾는다", () => {
    expect(fridge.mealOn("2026-11-14")?.lunch).toBe("김치찌개");
    expect(fridge.mealOn("2026-11-15")).toBeNull();
  });

  it("빈 날에 저녁을 적으면 점심은 빈 채로 행이 생긴다", async () => {
    await fridge.setMeal("2026-11-15", "dinner", "  파스타 ");
    expect(fridge.mealOn("2026-11-15")).toEqual({ day: "2026-11-15", lunch: "", dinner: "파스타" });
    expect(repo.upsertMeal).toHaveBeenCalledWith({ day: "2026-11-15", lunch: "", dinner: "파스타" });
  });

  it("한 끼를 바꿔도 다른 끼니는 그대로다", async () => {
    await fridge.setMeal("2026-11-14", "dinner", "삼겹살");
    expect(fridge.mealOn("2026-11-14")).toEqual({ day: "2026-11-14", lunch: "김치찌개", dinner: "삼겹살" });
  });

  it("값이 그대로면 저장하지 않는다", async () => {
    expect(await fridge.setMeal("2026-11-14", "lunch", "김치찌개 ")).toBe(false);
    expect(repo.upsertMeal).not.toHaveBeenCalled();
  });

  it("남은 끼니가 있으면 한 끼를 비워도 행은 남는다", async () => {
    await fridge.setMeal("2026-11-14", "dinner", "국수");
    await fridge.setMeal("2026-11-14", "lunch", "");
    expect(fridge.mealOn("2026-11-14")).toEqual({ day: "2026-11-14", lunch: "", dinner: "국수" });
    expect(repo.deleteMeal).not.toHaveBeenCalled();
  });

  it("점심·저녁이 모두 비면 그날의 행을 지운다", async () => {
    await fridge.setMeal("2026-11-14", "lunch", "");
    expect(fridge.mealOn("2026-11-14")).toBeNull();
    expect(repo.deleteMeal).toHaveBeenCalledWith("2026-11-14");
  });
});

describe("로그아웃", () => {
  it("정리하면 데이터를 비운다", async () => {
    await fridge.load();
    await fridge.stop();
    expect(fridge.items).toEqual({});
    expect(fridge.shopping).toEqual({});
    expect(fridge.meals).toEqual({});
    expect(fridge.loaded).toBe(false);
  });
});

describe("로그아웃", () => {
  it("로그아웃 뒤에 실패로 끝난 쓰기는 다시 불러오지 않는다", async () => {
    // Arrange: 쓰기가 서버 응답을 기다리는 사이에 로그아웃한다.
    await fridge.start();
    let fail!: (err: Error) => void;
    repo.upsertShopping.mockReturnValueOnce(new Promise<void>((_, reject) => (fail = reject)));
    const saving = fridge.addShopping("우유");
    await fridge.stop();
    repo.fetchItems.mockClear();
    // Act
    fail(new Error("연결 끊김"));
    await saving;
    // Assert
    expect(repo.fetchItems).not.toHaveBeenCalled();
  });
});
