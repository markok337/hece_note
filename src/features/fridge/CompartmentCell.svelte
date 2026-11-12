<script lang="ts">
  import { clock } from "../../core/clock.svelte";
  import { COMPARTMENT_LABELS, shortDate, visibleSlice, type Compartment } from "./domain";
  import { fridge } from "./store.svelte";

  interface Props {
    compartment: Compartment;
    selected: boolean;
    onselect: () => void;
  }

  /** 재료 한 줄의 높이(px). 칸에 몇 줄 들어가는지 이 값으로 센다. 아래 스타일의 .row 높이와 같아야 한다. */
  const ROW_PX = 20;

  const { compartment, selected, onselect }: Props = $props();

  const items = $derived(fridge.itemsIn(compartment));
  let listHeight = $state(0);
  const capacity = $derived(Math.floor(listHeight / ROW_PX));
  const preview = $derived(visibleSlice(items, capacity));
  const label = $derived(COMPARTMENT_LABELS[compartment]);
</script>

<button
  type="button"
  class="cell"
  class:selected
  aria-label="{label}, 재료 {items.length}개"
  aria-pressed={selected}
  onclick={onselect}
>
  <span class="head">
    <span class="title">{label}</span>
    <span class="count">{items.length}</span>
  </span>
  <span class="list" bind:clientHeight={listHeight}>
    {#each preview.shown as item (item.id)}
      <span class="row">
        <span class="name">{item.name}</span>
        {#if item.quantity !== null}<span class="qty">×{item.quantity}</span>{/if}
        <span class="date">{shortDate(item.added_on, clock.today)}</span>
      </span>
    {/each}
    {#if preview.hidden > 0}
      <span class="row more">+{preview.hidden}개</span>
    {:else if items.length === 0}
      <span class="row empty">비어 있음</span>
    {/if}
  </span>
</button>

<style>
  .cell {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
    min-height: 0;
    padding: 8px 10px;
    overflow: hidden;
    text-align: left;
    font-weight: 400;
    color: var(--text);
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 10px;
    box-shadow: var(--shadow);
  }
  .cell.selected { border-color: var(--accent); box-shadow: 0 0 0 2px var(--accent); }

  .head { display: flex; align-items: baseline; justify-content: space-between; gap: 6px; flex-shrink: 0; }
  .title { font-size: 1rem; font-weight: 700; }
  .count { font-size: 0.8rem; color: var(--muted); }

  /* 남는 높이를 모두 쓴다. 안에 줄이 몇 개 들어가는지는 이 높이를 재서 정한다. */
  .list { flex: 1; min-height: 0; display: flex; flex-direction: column; overflow: hidden; }
  .row {
    flex-shrink: 0;
    display: flex;
    align-items: baseline;
    gap: 6px;
    height: 20px; /* ROW_PX */
    line-height: 20px;
    font-size: 0.8rem;
    white-space: nowrap;
  }
  .name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
  .qty { font-weight: 700; }
  .date { color: var(--muted); font-size: 0.72rem; }
  .more, .empty { color: var(--muted); }
</style>
