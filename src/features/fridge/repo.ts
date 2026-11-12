// fridge_items / shopping_items 접근. Supabase 호출은 이 파일에만 둔다.

import type { RealtimeChannel } from "@supabase/supabase-js";
import type { FridgeItem, ShoppingItem } from "./domain";
import { supabase } from "../../supabase";

const ITEM_COLUMNS = "id, compartment, name, added_on, quantity, created_at";
const SHOPPING_COLUMNS = "id, name, checked, created_at";

/** 서버 행에서 앱이 쓰는 컬럼만 남긴다. 실시간 알림에는 user_id 같은 컬럼이 섞여 온다. */
export function pickItem(row: FridgeItem): FridgeItem {
  const { id, compartment, name, added_on, quantity, created_at } = row;
  return { id, compartment, name, added_on, quantity, created_at };
}

export function pickShopping(row: ShoppingItem): ShoppingItem {
  const { id, name, checked, created_at } = row;
  return { id, name, checked, created_at };
}

function client() {
  if (!supabase) throw new Error("Supabase 설정이 비어 있다.");
  return supabase;
}

function check(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

export async function fetchItems(): Promise<FridgeItem[]> {
  const { data, error } = await client().from("fridge_items").select(ITEM_COLUMNS);
  check(error);
  return data as FridgeItem[];
}

export async function fetchShopping(): Promise<ShoppingItem[]> {
  const { data, error } = await client().from("shopping_items").select(SHOPPING_COLUMNS);
  check(error);
  return data as ShoppingItem[];
}

export async function upsertItem(item: FridgeItem): Promise<void> {
  check((await client().from("fridge_items").upsert(pickItem(item), { onConflict: "id" })).error);
}

export async function deleteItem(id: string): Promise<void> {
  check((await client().from("fridge_items").delete().eq("id", id)).error);
}

export async function upsertShopping(item: ShoppingItem): Promise<void> {
  check((await client().from("shopping_items").upsert(pickShopping(item), { onConflict: "id" })).error);
}

export async function deleteShopping(id: string): Promise<void> {
  check((await client().from("shopping_items").delete().eq("id", id)).error);
}

export async function deleteCheckedShopping(): Promise<void> {
  check((await client().from("shopping_items").delete().eq("checked", true)).error);
}

export interface RowChange<T> {
  kind: "upsert" | "delete";
  id: string;
  row?: T;
}

export interface FridgeHandlers {
  onItem: (change: RowChange<FridgeItem>) => void;
  onShopping: (change: RowChange<ShoppingItem>) => void;
  onStatus: (isLive: boolean) => void;
}

/** 다른 기기의 변경을 받는다. 상태 콜백은 연결/끊김마다 불린다. */
export function subscribeFridge({ onItem, onShopping, onStatus }: FridgeHandlers): RealtimeChannel {
  return client()
    .channel("fridge_feed")
    .on("postgres_changes", { event: "*", schema: "public", table: "fridge_items" }, (payload) => {
      if (payload.eventType === "DELETE") {
        const old = payload.old as Partial<FridgeItem>;
        if (old.id) onItem({ kind: "delete", id: old.id });
        return;
      }
      const row = pickItem(payload.new as FridgeItem);
      onItem({ kind: "upsert", id: row.id, row });
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "shopping_items" }, (payload) => {
      if (payload.eventType === "DELETE") {
        const old = payload.old as Partial<ShoppingItem>;
        if (old.id) onShopping({ kind: "delete", id: old.id });
        return;
      }
      const row = pickShopping(payload.new as ShoppingItem);
      onShopping({ kind: "upsert", id: row.id, row });
    })
    .subscribe((status) => onStatus(status === "SUBSCRIBED"));
}

export async function unsubscribe(channel: RealtimeChannel): Promise<void> {
  await client().removeChannel(channel);
}
