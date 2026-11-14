// fridge_items / shopping_items 접근. Supabase 호출은 이 파일에만 둔다.

import type { RealtimeChannel } from "@supabase/supabase-js";
import type { FridgeItem, Meal, ShoppingItem } from "./domain";
import { fetchAllPages } from "../../core/paging";
import { supabase } from "../../supabase";

const ITEM_COLUMNS = "id, compartment, name, added_on, quantity, created_at";
const SHOPPING_COLUMNS = "id, name, checked, created_at";
const MEAL_COLUMNS = "day, lunch, dinner";

/** 서버 행에서 앱이 쓰는 컬럼만 남긴다. 실시간 알림에는 user_id 같은 컬럼이 섞여 온다. */
export function pickItem(row: FridgeItem): FridgeItem {
  const { id, compartment, name, added_on, quantity, created_at } = row;
  return { id, compartment, name, added_on, quantity, created_at };
}

export function pickShopping(row: ShoppingItem): ShoppingItem {
  const { id, name, checked, created_at } = row;
  return { id, name, checked, created_at };
}

export function pickMeal(row: Meal): Meal {
  const { day, lunch, dinner } = row;
  return { day, lunch, dinner };
}

function client() {
  if (!supabase) throw new Error("Supabase 설정이 비어 있다.");
  return supabase;
}

function check(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

// 서버가 한 번에 1000행까지만 주므로 이어서 받는다. 쪽이 겹치거나 빠지지 않게 id(기본키) 순으로 자른다.
export function fetchItems(): Promise<FridgeItem[]> {
  return fetchAllPages(async (from, to) => {
    const { data, error } = await client().from("fridge_items").select(ITEM_COLUMNS).order("id").range(from, to);
    check(error);
    return data as FridgeItem[];
  });
}

export function fetchShopping(): Promise<ShoppingItem[]> {
  return fetchAllPages(async (from, to) => {
    const { data, error } = await client().from("shopping_items").select(SHOPPING_COLUMNS).order("id").range(from, to);
    check(error);
    return data as ShoppingItem[];
  });
}

// 식단은 하루에 한 행이라 해마다 365행이 쌓인다. 서버 상한(1000행)을 넘겨도 빠지지 않게 날짜(기본키) 순으로 이어 받는다.
export function fetchMeals(): Promise<Meal[]> {
  return fetchAllPages(async (from, to) => {
    const { data, error } = await client().from("meal_plans").select(MEAL_COLUMNS).order("day").range(from, to);
    check(error);
    return data as Meal[];
  });
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

export async function upsertMeal(meal: Meal): Promise<void> {
  check((await client().from("meal_plans").upsert(pickMeal(meal), { onConflict: "user_id,day" })).error);
}

export async function deleteMeal(day: string): Promise<void> {
  check((await client().from("meal_plans").delete().eq("day", day)).error);
}

export interface RowChange<T> {
  kind: "upsert" | "delete";
  id: string;
  row?: T;
}

export interface FridgeHandlers {
  onItem: (change: RowChange<FridgeItem>) => void;
  onShopping: (change: RowChange<ShoppingItem>) => void;
  /** 식단은 날짜가 곧 키라서 change.id 가 날짜다. */
  onMeal: (change: RowChange<Meal>) => void;
  onStatus: (isLive: boolean) => void;
}

/** 다른 기기의 변경을 받는다. 상태 콜백은 연결/끊김마다 불린다. */
export function subscribeFridge({ onItem, onShopping, onMeal, onStatus }: FridgeHandlers): RealtimeChannel {
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
    .on("postgres_changes", { event: "*", schema: "public", table: "meal_plans" }, (payload) => {
      if (payload.eventType === "DELETE") {
        const old = payload.old as Partial<Meal>;
        if (old.day) onMeal({ kind: "delete", id: old.day });
        return;
      }
      const row = pickMeal(payload.new as Meal);
      onMeal({ kind: "upsert", id: row.day, row });
    })
    .subscribe((status) => onStatus(status === "SUBSCRIBED"));
}

export async function unsubscribe(channel: RealtimeChannel): Promise<void> {
  await client().removeChannel(channel);
}
