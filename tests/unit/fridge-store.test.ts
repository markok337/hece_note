import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FridgeItem, ShoppingItem } from "../../src/features/fridge/domain";

const repo = vi.hoisted(() => ({
  fetchItems: vi.fn(),
  fetchShopping: vi.fn(),
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
  for (const name of ["upsertItem", "deleteItem", "upsertShopping", "deleteShopping", "deleteCheckedShopping", "unsubscribe"] as const) {
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

describe("로그아웃", () => {
  it("정리하면 데이터를 비운다", async () => {
    await fridge.load();
    await fridge.stop();
    expect(fridge.items).toEqual({});
    expect(fridge.shopping).toEqual({});
    expect(fridge.loaded).toBe(false);
  });
});
