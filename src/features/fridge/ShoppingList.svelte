<script lang="ts">
  import { notice } from "../../core/notice.svelte";
  import { NAME_MAX, validateName } from "./domain";
  import { fridge } from "./store.svelte";

  const items = $derived(fridge.shoppingList());
  const checkedCount = $derived(items.filter((item) => item.checked).length);

  let text = $state("");

  function add(event: SubmitEvent): void {
    event.preventDefault();
    const error = validateName(text, "항목");
    if (error) return notice.say("err", error);
    const saving = fridge.addShopping(text.trim());
    // 아직 못 불러왔으면 스토어가 이유를 알리고 거절한다. 입력은 남겨 둔다.
    if (!fridge.loaded) return void saving;
    text = "";
  }
</script>

<section class="shop">
  <div class="title">
    <h2>구매목록</h2>
    <span class="sum">{items.length - checkedCount}개 남음</span>
    {#if checkedCount > 0}
      <button type="button" class="sub clear" onclick={() => void fridge.clearChecked()}>체크 {checkedCount}개 삭제</button>
    {/if}
  </div>

  <form class="add" onsubmit={add}>
    <!-- svelte-ignore a11y_autofocus -->
    <input bind:value={text} maxlength={NAME_MAX} placeholder="사야 할 것을 적고 엔터" aria-label="구매 항목" autofocus />
    <button type="submit">추가</button>
  </form>

  {#if items.length === 0}
    <p class="empty">비어 있다.</p>
  {:else}
    <ul>
      {#each items as item (item.id)}
        <li class:done={item.checked}>
          <button
            type="button"
            class="sub toggle"
            aria-pressed={item.checked}
            title={item.name}
            onclick={() => void fridge.toggleShopping(item.id)}
          >
            <span class="box">{item.checked ? "✓" : ""}</span>
            <span class="txt">{item.name}</span>
          </button>
          <button type="button" class="sub del" aria-label="{item.name} 삭제" onclick={() => void fridge.removeShopping(item.id)}>✕</button>
        </li>
      {/each}
    </ul>
  {/if}
</section>

<style>
  .shop { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 8px; }

  /* 오른쪽 위의 닫기 버튼을 피해 한 줄로 둔다. */
  .title { flex-shrink: 0; display: flex; align-items: baseline; gap: 8px; padding-right: 36px; min-height: 30px; }
  h2 { margin: 0; font-size: 1.05rem; }
  .sum { font-size: 0.8rem; color: var(--muted); }
  .clear { margin-left: auto; padding: 4px 10px; font-size: 0.8rem; }

  /* 입력과 추가를 한 줄에 붙여 영역을 최소로 쓴다. */
  .add { flex-shrink: 0; gap: 6px; }
  .add input { padding: 8px 10px; }
  .add button { padding: 8px 14px; }

  /* 항목은 두 열로 촘촘하게 놓아 한눈에 보이게 한다. */
  ul {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    align-content: start;
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    gap: 4px;
  }
  li { display: flex; gap: 2px; min-width: 0; }
  .toggle {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 5px 6px;
    font-size: 0.9rem;
    text-align: left;
    background: var(--bg);
    border-color: var(--line);
  }
  .txt { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .box {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    border: 2px solid var(--muted);
    border-radius: 4px;
    font-size: 0.75rem;
    line-height: 1;
  }
  .done .toggle { color: var(--muted); }
  .done .txt { text-decoration: line-through; }
  .done .box { background: var(--accent); border-color: var(--accent); color: var(--accent-text); }
  .del { width: 26px; padding: 0; font-size: 0.85rem; }

  .empty { margin: 0; color: var(--muted); font-size: 0.9rem; }
</style>
