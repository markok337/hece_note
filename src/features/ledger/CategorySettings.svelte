<script lang="ts">
  // 분류 설정. 지출을 적을 때 고르는 분류를 더하고 빼고, 손잡이를 끌어 순서를 바꾼다.
  // 뺀 분류로 이미 적은 이력은 지우지 않고 이름 그대로 남는다.
  import { notice } from "../../core/notice.svelte";
  import ConfirmButton from "../../ui/ConfirmButton.svelte";
  import { CATEGORY_NAME_MAX, moveItem, validateCategoryName } from "./domain";
  import { ledger } from "./store.svelte";

  let name = $state("");

  const categories = $derived(ledger.categories);
  const isLast = $derived(categories.length <= 1);

  // 끌어서 순서 바꾸기. 터치에서도 되도록 포인터 이벤트를 쓴다. 끄는 동안에는 목록을 바꾸지 않고,
  // 놓은 자리의 칩 위치로 옮긴다(손가락을 따라 칩이 움직이면 잡고 있던 손잡이가 사라질 수 있다).
  let dragging = $state<string | null>(null);
  let over = $state<string | null>(null);

  function grab(event: PointerEvent, name: string): void {
    if (event.button > 0) return;
    dragging = name;
    over = null;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }

  function drag(event: PointerEvent): void {
    if (!dragging) return;
    const chip = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("li[data-name]");
    over = chip?.dataset.name ?? null;
  }

  function drop(): void {
    const from = dragging;
    const to = over;
    dragging = null;
    over = null;
    if (from && to && from !== to) void ledger.reorderCategories(moveItem(categories, categories.indexOf(from), categories.indexOf(to)));
  }

  function cancelDrag(): void {
    dragging = null;
    over = null;
  }

  /** 손잡이에서 방향키로 한 칸씩 옮긴다. */
  function nudge(event: KeyboardEvent, name: string): void {
    const step = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 }[event.key];
    if (!step) return;
    event.preventDefault();
    const index = categories.indexOf(name);
    void ledger.reorderCategories(moveItem(categories, index, index + step));
  }

  async function add(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    const error = validateCategoryName(name, categories);
    if (error) return notice.say("err", error);
    if (await ledger.addCategory(name.trim())) name = "";
  }
</script>

<div class="sheet">
  <h2 class="band">분류</h2>

  <form class="add" onsubmit={add}>
    <input bind:value={name} maxlength={CATEGORY_NAME_MAX} placeholder="새 분류 이름" aria-label="새 분류 이름" />
    <button type="submit">추가</button>
  </form>

  <ul>
    {#each categories as category (category)}
      <li data-name={category} class:dragging={dragging === category} class:over={over === category && dragging !== category}>
        <button
          type="button"
          class="grip"
          aria-label="{category} 순서 바꾸기. 끌거나 방향키로 옮긴다"
          onpointerdown={(event) => grab(event, category)}
          onpointermove={drag}
          onpointerup={drop}
          onpointercancel={cancelDrag}
          onkeydown={(event) => nudge(event, category)}
        >⋮⋮</button>
        <span class="name">{category}</span>
        <span class="count" title="{ledger.categoryUsage(category)}건에서 쓰는 중">{ledger.categoryUsage(category)}</span>
        <ConfirmButton name="{category} 분류" width="30px" small disabled={isLast} onconfirm={() => ledger.removeCategory(category)} />
      </li>
    {/each}
  </ul>
</div>

<style>
  .add { gap: 6px; padding: 8px 10px; border-bottom: 1px solid var(--line); }
  .add input { flex: 1 1 0; min-width: 0; padding: 9px 8px; font-size: 0.9rem; }
  .add button { flex-shrink: 0; padding: 0 16px; font-size: 0.9rem; }

  /* 분류는 칩으로 가로로 흘러 줄 수가 적다. 칩 하나가 이름, 쓰인 건수, 지우는 버튼이다. */
  ul { list-style: none; margin: 0; padding: 8px 10px; display: flex; flex-wrap: wrap; gap: 6px; }
  li {
    display: flex;
    align-items: center;
    gap: 3px;
    padding: 3px 3px 3px 2px;
    background: var(--panel);
    border: 1px solid var(--line-strong);
    border-radius: 15px;
  }
  li.dragging { opacity: 0.45; }
  li.over { border-color: var(--accent); box-shadow: 0 0 0 2px var(--accent); }
  /* 손잡이에서만 touch-action 을 막아, 칩 밖에서는 화면이 그대로 스크롤된다. */
  .grip {
    width: 22px;
    height: 24px;
    padding: 0;
    font-size: 0.8rem;
    letter-spacing: -2px;
    line-height: 1;
    color: var(--muted);
    background: transparent;
    border: 0;
    cursor: grab;
    touch-action: none;
  }
  .name { font-size: 0.9rem; font-weight: 700; }
  .count { min-width: 1.2em; font-size: 0.72rem; text-align: center; color: var(--muted); }
</style>
