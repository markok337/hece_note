import type { RealtimeChannel } from "@supabase/supabase-js";
import { fetchAllPages } from "../../core/paging";
import { supabase } from "../../supabase";

export interface TodoItem {
  id: string;
  content: string;
  completed: boolean;
  created_at: string;
}

function client() {
  if (!supabase) throw new Error("Supabase 설정이 비어 있다.");
  return supabase;
}

export function fetchTodos(): Promise<TodoItem[]> {
  return fetchAllPages(async (from, to) => {
    const { data, error } = await client().from("todo_items")
      .select("id,content,completed,created_at")
      .order("created_at").order("id").range(from, to);
    if (error) throw error;
    return data as TodoItem[];
  });
}

export async function saveTodo(item: TodoItem): Promise<void> {
  const { error } = await client().from("todo_items").upsert(item);
  if (error) throw error;
}

export async function clearCompleted(): Promise<void> {
  const { error } = await client().from("todo_items").delete().eq("completed", true);
  if (error) throw error;
}

export function subscribeTodos(onChange: () => void, onStatus: (live: boolean) => void): RealtimeChannel {
  return client().channel("todo_feed")
    .on("postgres_changes", { event: "*", schema: "public", table: "todo_items" }, onChange)
    .subscribe((status) => onStatus(status === "SUBSCRIBED"));
}

export async function unsubscribe(channel: RealtimeChannel): Promise<void> {
  await client().removeChannel(channel);
}
