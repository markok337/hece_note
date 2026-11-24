<script lang="ts">
  import { todo } from "./store.svelte";

  let content = $state("");
  let filter = $state<"open" | "all">("open");
  let confirmClear = $state(false);
  let confirmTimer: ReturnType<typeof setTimeout> | undefined;

  const ordered = $derived([...todo.items].sort((a, b) =>
    a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id)));
  const visible = $derived(filter === "open" ? ordered.filter((item) => !item.completed) : ordered);
  const completedCount = $derived(todo.items.filter((item) => item.completed).length);

  async function add(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    if (await todo.add(content)) content = "";
  }

  function clear(): void {
    if (!confirmClear) {
      confirmClear = true;
      confirmTimer = setTimeout(() => { confirmClear = false; }, 3000);
      return;
    }
    clearTimeout(confirmTimer);
    confirmClear = false;
    void todo.clearCompleted();
  }
</script>

<section class="todo">
  <form class="add" onsubmit={add}>
    <input bind:value={content} maxlength="500" placeholder="할일을 입력하세요" aria-label="할일 내용" />
    <button type="submit">추가</button>
  </form>

  <div class="tools">
    <div class="filters" aria-label="할일 필터">
      <button type="button" class:chosen={filter === "open"} aria-pressed={filter === "open"} onclick={() => filter = "open"}>미완료</button>
      <button type="button" class:chosen={filter === "all"} aria-pressed={filter === "all"} onclick={() => filter = "all"}>전체</button>
    </div>
    <button type="button" class="clear" class:confirm={confirmClear} disabled={completedCount === 0} onclick={clear}>
      {confirmClear ? "한 번 더 눌러 삭제" : "완료 전체 삭제"}
    </button>
  </div>

  {#if visible.length === 0}
    <p class="empty">{filter === "open" ? "남은 할일이 없습니다." : "할일이 없습니다."}</p>
  {:else}
    <ul>
      {#each visible as item (item.id)}
        <li class:done={item.completed}>
          <label title={item.content}>
            <input type="checkbox" checked={item.completed} onchange={() => void todo.toggle(item.id)} />
            <span>{item.content}</span>
          </label>
        </li>
      {/each}
    </ul>
  {/if}
</section>

<style>
  .todo { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 12px; padding: 8px 0; }
  .add { flex-shrink: 0; gap: 8px; }
  .add input { padding: 9px 12px; }
  .add button { padding: 9px 16px; }
  .tools { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-shrink: 0; }
  .filters { display: flex; gap: 4px; }
  .filters button, .clear { padding: 5px 9px; font-size: 0.82rem; font-weight: 400; background: transparent; color: var(--muted); border: 1px solid transparent; }
  .filters button.chosen { color: var(--accent-strong); border-color: var(--line-strong); background: var(--panel); font-weight: 700; }
  .clear { color: var(--danger); white-space: nowrap; }
  .clear.confirm { border-color: var(--danger); }
  .clear:disabled { border: 0; background: transparent; color: var(--muted); }
  ul { flex: 1; min-height: 0; overflow-y: auto; list-style: none; margin: 0; padding: 0; background: var(--panel); border: 1px solid var(--line); border-radius: 8px; }
  li + li { border-top: 1px solid var(--line); }
  label { min-height: 44px; display: flex; align-items: center; gap: 11px; padding: 8px 12px; cursor: pointer; }
  label input { flex: none; width: 19px; height: 19px; margin: 0; padding: 0; accent-color: var(--accent); }
  label span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .done span { color: var(--muted); text-decoration: line-through; }
  .empty { color: var(--muted); text-align: center; margin: 32px 0; }
</style>
