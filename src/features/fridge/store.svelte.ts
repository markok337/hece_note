// 화면이 구독하는 냉장고 상태(재료 + 구매목록). 낙관적으로 먼저 바꾸고, 저장에 실패하면 서버 값으로 되돌린다.

import type { RealtimeChannel } from "@supabase/supabase-js";
import {
  sortOldestFirst,
  sortShopping,
  type Compartment,
  type FridgeItem,
  type ShoppingItem,
} from "./domain";
import {
  deleteCheckedShopping,
  deleteItem,
  deleteShopping,
  fetchItems,
  fetchShopping,
  subscribeFridge,
  unsubscribe,
  upsertItem,
  upsertShopping,
  type RowChange,
} from "./repo";
import { notice } from "../../core/notice.svelte";
import { WriteQueue } from "../../core/write-queue";

const NOT_LOADED_MESSAGE = "아직 불러오지 못했다. 새로고침 후 다시 시도한다.";

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

class FridgeStore {
  items = $state<Record<string, FridgeItem>>({});
  shopping = $state<Record<string, ShoppingItem>>({});
  loaded = $state(false);
  live = $state(false);

  #channel: RealtimeChannel | null = null;
  // 블로그 스토어와 같은 방식이다: 쓰는 동안 들어온 알림과 불러오기는 미루고, 끝나면 한 번만 다시 불러온다.
  #writes = new WriteQueue(() => void this.load());
  #epoch = 0;
  #loadSeq = 0;

  /** 한 칸의 재료. 오래된 것이 먼저. */
  itemsIn(compartment: Compartment): FridgeItem[] {
    return sortOldestFirst(Object.values(this.items).filter((item) => item.compartment === compartment));
  }

  /** 구매목록. 체크 안 한 항목이 먼저. */
  shoppingList(): ShoppingItem[] {
    return sortShopping(Object.values(this.shopping));
  }

  /** 아직 체크하지 않은(사야 하는) 항목 수. */
  get toBuy(): number {
    return Object.values(this.shopping).filter((item) => !item.checked).length;
  }

  async load(): Promise<void> {
    if (this.#writes.busy) {
      this.#writes.markDirty();
      return;
    }
    const seq = ++this.#loadSeq;
    const epoch = this.#epoch;
    try {
      const [items, shopping] = await Promise.all([fetchItems(), fetchShopping()]);
      if (seq !== this.#loadSeq) return;
      // 응답을 기다리는 사이 쓰기가 시작됐다면 이 값은 내 변경보다 오래됐다. 버리고 쓰기가 끝난 뒤 다시 받는다.
      if (epoch !== this.#epoch) {
        if (this.#writes.busy) this.#writes.markDirty();
        else void this.load();
        return;
      }
      this.items = Object.fromEntries(items.map((row) => [row.id, row]));
      this.shopping = Object.fromEntries(shopping.map((row) => [row.id, row]));
      this.loaded = true;
    } catch (err) {
      notice.say("err", `불러오기 실패: ${(err as Error).message}`);
    }
  }

  async start(): Promise<void> {
    await this.load();
    this.#channel = subscribeFridge({
      onItem: (change) => this.#receive(() => applyChange(this.items, change)),
      onShopping: (change) => this.#receive(() => applyChange(this.shopping, change)),
      onStatus: (isLive) => {
        this.live = isLive;
        // 끊겼다 다시 붙으면 그사이 놓친 변경을 다시 가져온다.
        if (isLive) void this.load();
      },
    });
  }

  async stop(): Promise<void> {
    if (this.#channel) await unsubscribe(this.#channel);
    this.#channel = null;
    this.live = false;
    this.loaded = false;
    this.#loadSeq += 1; // 로그아웃 뒤에 늦게 도착한 응답이 화면을 채우지 않게 한다.
    this.items = {};
    this.shopping = {};
  }

  #receive(apply: () => void): void {
    if (this.#writes.busy) this.#writes.markDirty();
    else apply();
  }

  /** 화면을 먼저 바꾸고 서버에는 누른 순서대로 보낸다. 못 불러온 채 쓰면 서버 내용을 덮을 수 있어 막는다. */
  #write(apply: () => void, task: () => Promise<void>, failure: string): Promise<boolean> {
    if (!this.loaded) {
      notice.say("err", NOT_LOADED_MESSAGE);
      return Promise.resolve(false);
    }
    this.#epoch += 1;
    apply();
    return this.#writes.run(task, (err) => notice.say("err", `${failure}: ${(err as Error).message}`));
  }

  addItem(input: NewItem): Promise<boolean> {
    const item: FridgeItem = { ...input, id: crypto.randomUUID(), created_at: new Date().toISOString() };
    return this.#write(
      () => (this.items[item.id] = item),
      () => upsertItem(item),
      "재료 추가 실패",
    );
  }

  removeItem(id: string): Promise<boolean> {
    return this.#write(
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
    return this.#write(
      () => (this.items[id] = next),
      () => upsertItem(next),
      failure,
    );
  }

  addShopping(name: string): Promise<boolean> {
    const item: ShoppingItem = { id: crypto.randomUUID(), name, checked: false, created_at: new Date().toISOString() };
    return this.#write(
      () => (this.shopping[item.id] = item),
      () => upsertShopping(item),
      "구매목록 추가 실패",
    );
  }

  toggleShopping(id: string): Promise<boolean> {
    const current = this.shopping[id];
    if (!current) return Promise.resolve(false);
    const next = { ...current, checked: !current.checked };
    return this.#write(
      () => (this.shopping[id] = next),
      () => upsertShopping(next),
      "구매목록 저장 실패",
    );
  }

  removeShopping(id: string): Promise<boolean> {
    return this.#write(
      () => delete this.shopping[id],
      () => deleteShopping(id),
      "구매목록 삭제 실패",
    );
  }

  /** 체크한 항목을 한꺼번에 지운다. */
  clearChecked(): Promise<boolean> {
    return this.#write(
      () => {
        for (const item of Object.values(this.shopping)) if (item.checked) delete this.shopping[item.id];
      },
      () => deleteCheckedShopping(),
      "체크 항목 삭제 실패",
    );
  }
}

export const fridge = new FridgeStore();
