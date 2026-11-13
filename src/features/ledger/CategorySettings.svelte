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
    padding: 3px 3px 3px 10px;
    background: var(--panel);
    border: 1px solid var(--line-strong);
    border-radius: 15px;
  }
  .name { font-size: 0.9rem; font-weight: 700; }
  .count { min-width: 1.2em; font-size: 0.72rem; text-align: center; color: var(--muted); }
</style>
