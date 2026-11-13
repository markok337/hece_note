<script lang="ts">
  // 분류 설정. 지출을 적을 때 고르는 분류를 더하고 뺀다.
  // 뺀 분류로 이미 적은 이력은 지우지 않고 이름 그대로 남는다.
  import { notice } from "../../core/notice.svelte";
  import ConfirmButton from "../../ui/ConfirmButton.svelte";
  import { CATEGORY_NAME_MAX, validateCategoryName } from "./domain";
  import { ledger } from "./store.svelte";

  let name = $state("");

  const categories = $derived(ledger.categories);
  const isLast = $derived(categories.length <= 1);

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
      <li>
        <span class="name">{category}</span>
        <span class="count">{ledger.categoryUsage(category)}건</span>
        <ConfirmButton name="{category} 분류" disabled={isLast} onconfirm={() => ledger.removeCategory(category)} />
      </li>
    {/each}
  </ul>
</div>

<style>
  .add { gap: 6px; padding: 8px 10px; border-bottom: 1px solid var(--line); }
  .add input { flex: 1 1 0; min-width: 0; padding: 9px 8px; font-size: 0.9rem; }
  .add button { flex-shrink: 0; padding: 0 16px; font-size: 0.9rem; }

  ul { list-style: none; margin: 0; padding: 0; }
  li { display: flex; align-items: center; gap: 8px; padding: 6px 10px; border-bottom: 1px solid var(--line); }
  li:last-child { border-bottom: 0; }
  .name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 0.9rem; font-weight: 700; }
  .count { font-size: 0.75rem; color: var(--muted); }
</style>
