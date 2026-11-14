// 화면이 구독하는 냉장고 상태(재료 + 구매목록 + 식단). 낙관적으로 먼저 바꾸고, 저장에 실패하면 서버 값으로 되돌린다.
// 불러오기·쓰기 줄 세우기·실시간 알림 처리의 공통 규칙은 core/synced-store 에 있다.

import type { RealtimeChannel } from "@supabase/supabase-js";
import {
  isEmptyMeal,
  sortOldestFirst,
  sortShopping,
  type Compartment,
  type FridgeItem,
  type Meal,
  type MealSlot,
  type ShoppingItem,
} from "./domain";
import {
  deleteCheckedShopping,
  deleteItem,
  deleteMeal,
  deleteShopping,
  fetchItems,
  fetchMeals,
  fetchShopping,
  subscribeFridge,
  unsubscribe,
  upsertItem,
  upsertMeal,
  upsertShopping,
  type RowChange,
} from "./repo";
import { SyncedStore, type Receive, type StatusHandler } from "../../core/synced-store.svelte";

interface Snapshot {
  items: FridgeItem[];
  shopping: ShoppingItem[];
  meals: Meal[];
}

export interface NewItem {
  compartment: Compartment;
  name: string;
  added_on: string;
  quantity: number | null;
}

/** 실시간 알림 하나를 목록에 반영한다. */
function applyChange<T>(map: Record<string, T>, change: RowChange<T>): void {
  if (change.kind === "delete") delete map[change.id];
  else if (change.row) map[change.id] = change.row;
}

class FridgeStore extends SyncedStore<Snapshot> {
  items = $state<Record<string, FridgeItem>>({});
  shopping = $state<Record<string, ShoppingItem>>({});
  /** 날짜("2026-11-08")별 식단. 점심·저녁이 모두 빈 날은 없다. */
  meals = $state<Record<string, Meal>>({});

  /** 한 칸의 재료. 오래된 것이 먼저. */
  itemsIn(compartment: Compartment): FridgeItem[] {
    return sortOldestFirst(Object.values(this.items).filter((item) => item.compartment === compartment));
  }

  /** 구매목록. 체크 안 한 항목이 먼저. */
  shoppingList(): ShoppingItem[] {
    return sortShopping(Object.values(this.shopping));
  }

  /** 그날의 식단. 적은 게 없으면 null. */
  mealOn(day: string): Meal | null {
    return this.meals[day] ?? null;
  }

  /** 아직 체크하지 않은(사야 하는) 항목 수. */
  get toBuy(): number {
    return Object.values(this.shopping).filter((item) => !item.checked).length;
  }

  protected async fetchSnapshot(): Promise<Snapshot> {
    const [items, shopping, meals] = await Promise.all([fetchItems(), fetchShopping(), fetchMeals()]);
    return { items, shopping, meals };
  }

  protected applySnapshot({ items, shopping, meals }: Snapshot): void {
    this.items = Object.fromEntries(items.map((row) => [row.id, row]));
    this.shopping = Object.fromEntries(shopping.map((row) => [row.id, row]));
    this.meals = Object.fromEntries(meals.map((row) => [row.day, row]));
  }

  protected clearData(): void {
    this.items = {};
    this.shopping = {};
    this.meals = {};
  }

  protected subscribe(receive: Receive, onStatus: StatusHandler): RealtimeChannel {
    return subscribeFridge({
      onItem: (change) => receive(() => applyChange(this.items, change)),
      onShopping: (change) => receive(() => applyChange(this.shopping, change)),
      onMeal: (change) => receive(() => applyChange(this.meals, change)),
      onStatus,
    });
  }

  protected unsubscribe(channel: RealtimeChannel): Promise<void> {
    return unsubscribe(channel);
  }

  addItem(input: NewItem): Promise<boolean> {
    const item: FridgeItem = { ...input, id: crypto.randomUUID(), created_at: new Date().toISOString() };
    return this.write(
      () => (this.items[item.id] = item),
      () => upsertItem(item),
      "재료 추가 실패",
    );
  }

  removeItem(id: string): Promise<boolean> {
    return this.write(
      () => delete this.items[id],
      () => deleteItem(id),
      "재료 삭제 실패",
    );
  }

  /** 개수를 바꾼다. null 은 개수 없음. 값이 올바른지는 부르는 쪽이 확인한다. */
  setQuantity(id: string, quantity: number | null): Promise<boolean> {
    return this.#patchItem(id, { quantity }, "개수 저장 실패");
  }

  /** 추가된 날짜를 바꾼다. 값이 올바른지는 부르는 쪽이 확인한다. */
  setAddedOn(id: string, added_on: string): Promise<boolean> {
    return this.#patchItem(id, { added_on }, "날짜 저장 실패");
  }

  /** 이미 있는 재료의 일부 필드만 바꿔 저장한다. 바뀐 게 없으면 아무것도 안 한다. */
  #patchItem(id: string, patch: Partial<Pick<FridgeItem, "quantity" | "added_on">>, failure: string): Promise<boolean> {
    const current = this.items[id];
    if (!current || Object.entries(patch).every(([key, value]) => current[key as keyof FridgeItem] === value)) {
      return Promise.resolve(false);
    }
    const next = { ...current, ...patch };
    return this.write(
      () => (this.items[id] = next),
      () => upsertItem(next),
      failure,
    );
  }

  /**
   * 그날 한 끼의 메뉴를 바꾼다. 비우면 그 끼니를 지우고, 점심·저녁이 모두 비면 그날의 행을 지운다.
   * 값 길이는 부르는 쪽이 확인한다. 바뀐 게 없으면 아무것도 안 한다.
   */
  setMeal(day: string, slot: MealSlot, text: string): Promise<boolean> {
    const current = this.meals[day] ?? { day, lunch: "", dinner: "" };
    const next: Meal = { ...current, [slot]: text.trim() };
    if (next[slot] === current[slot]) return Promise.resolve(false);
    if (isEmptyMeal(next)) {
      return this.write(
        () => delete this.meals[day],
        () => deleteMeal(day),
        "식단 삭제 실패",
      );
    }
    return this.write(
      () => (this.meals[day] = next),
      () => upsertMeal(next),
      "식단 저장 실패",
    );
  }

  addShopping(name: string): Promise<boolean> {
    const item: ShoppingItem = { id: crypto.randomUUID(), name, checked: false, created_at: new Date().toISOString() };
    return this.write(
      () => (this.shopping[item.id] = item),
      () => upsertShopping(item),
      "구매목록 추가 실패",
    );
  }

  toggleShopping(id: string): Promise<boolean> {
    const current = this.shopping[id];
    if (!current) return Promise.resolve(false);
    const next = { ...current, checked: !current.checked };
    return this.write(
      () => (this.shopping[id] = next),
      () => upsertShopping(next),
      "구매목록 저장 실패",
    );
  }

  removeShopping(id: string): Promise<boolean> {
    return this.write(
      () => delete this.shopping[id],
      () => deleteShopping(id),
      "구매목록 삭제 실패",
    );
  }

  /** 체크한 항목을 한꺼번에 지운다. */
  clearChecked(): Promise<boolean> {
    return this.write(
      () => {
        for (const item of Object.values(this.shopping)) if (item.checked) delete this.shopping[item.id];
      },
      () => deleteCheckedShopping(),
      "체크 항목 삭제 실패",
    );
  }
}

export const fridge = new FridgeStore();
