import type { RealtimeChannel } from "@supabase/supabase-js";
import { SyncedStore, type Receive, type StatusHandler } from "../../core/synced-store.svelte";
import { notice } from "../../core/notice.svelte";
import { clearCompleted, fetchTodos, saveTodo, subscribeTodos, unsubscribe, type TodoItem } from "./repo";

class TodoStore extends SyncedStore<TodoItem[]> {
  items = $state<TodoItem[]>([]);

  protected fetchSnapshot(): Promise<TodoItem[]> { return fetchTodos(); }
  protected applySnapshot(items: TodoItem[]): void { this.items = items; }
  protected clearData(): void { this.items = []; }
  protected subscribe(receive: Receive, onStatus: StatusHandler): RealtimeChannel {
    return subscribeTodos(() => receive(() => void this.load()), onStatus);
  }
  protected unsubscribe(channel: RealtimeChannel): Promise<void> { return unsubscribe(channel); }

  add(content: string): Promise<boolean> {
    const trimmed = content.trim();
    if (!trimmed) { notice.say("err", "할일 내용을 입력한다."); return Promise.resolve(false); }
    if (trimmed.length > 500) { notice.say("err", "할일은 500자까지 입력할 수 있다."); return Promise.resolve(false); }
    const item: TodoItem = { id: crypto.randomUUID(), content: trimmed, completed: false, created_at: new Date().toISOString() };
    return this.write(() => { this.items = [...this.items, item]; }, () => saveTodo(item), "할일 추가 실패");
  }

  toggle(id: string): Promise<boolean> {
    const current = this.items.find((item) => item.id === id);
    if (!current) return Promise.resolve(false);
    const updated = { ...current, completed: !current.completed };
    return this.write(
      () => { this.items = this.items.map((item) => item.id === id ? updated : item); },
      () => saveTodo(updated), "할일 변경 실패",
    );
  }

  clearCompleted(): Promise<boolean> {
    if (!this.items.some((item) => item.completed)) return Promise.resolve(false);
    return this.write(
      () => { this.items = this.items.filter((item) => !item.completed); },
      clearCompleted, "완료 항목 삭제 실패",
    );
  }
}

export const todo = new TodoStore();
