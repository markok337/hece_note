<script lang="ts">
  import { clock } from "../../core/clock.svelte";
  import { notice } from "../../core/notice.svelte";
  import {
    MAX_QUANTITY,
    NAME_MAX,
    compartmentTitle,
    decrease,
    increase,
    parseQuantity,
    shortDate,
    validateName,
    type Compartment,
    type FridgeItem,
  } from "./domain";
  import { fridge } from "./store.svelte";

  interface Props {
    compartment: Compartment;
  }

  const { compartment }: Props = $props();

  const items = $derived(fridge.itemsIn(compartment));

  let name = $state("");
  let addedOn = $state(clock.today);
  let quantityText = $state("");
  let nameInput = $state<HTMLInputElement>();

  function add(event: SubmitEvent): void {
    event.preventDefault();
    const nameError = validateName(name);
    if (nameError) return notice.say("err", nameError);
    if (!addedOn) return notice.say("err", "추가된 날짜를 고른다.");
    const quantity = parseQuantity(quantityText);
    if (!quantity.ok) return notice.say("err", quantity.reason);

    const saving = fridge.addItem({ compartment, name: name.trim(), added_on: addedOn, quantity: quantity.value });
    // 아직 못 불러왔으면 스토어가 이유를 알리고 거절한다. 입력은 남겨 둔다.
    if (!fridge.loaded) return void saving;
    name = "";
    quantityText = "";
    addedOn = clock.today;
    nameInput?.focus();
  }

  function setQuantity(item: FridgeItem, next: number | null): void {
    void fridge.setQuantity(item.id, next);
  }

  /** 개수 입력칸에서 값을 확정한다. 올바르지 않으면 이유를 알리고 저장된 값으로 되돌린다. */
  function commitQuantity(item: FridgeItem, input: HTMLInputElement): void {
    const parsed = parseQuantity(input.value);
    if (!parsed.ok) {
      notice.say("err", parsed.reason);
      input.value = String(item.quantity ?? "");
      return;
    }
    setQuantity(item, parsed.value);
  }
</script>

<section class="panel">
  <h2>{compartmentTitle(compartment)}</h2>

  <form class="add" onsubmit={add}>
    <input
      class="name-input"
      bind:this={nameInput}
      bind:value={name}
      maxlength={NAME_MAX}
      placeholder="재료 이름"
      aria-label="재료 이름"
    />
    <button type="submit">추가</button>
    <input class="date-input" type="date" bind:value={addedOn} aria-label="추가된 날짜" />
    <input
      class="qty-input"
      inputmode="numeric"
      bind:value={quantityText}
      placeholder="개수(선택)"
      aria-label="개수(선택)"
    />
  </form>

  {#if items.length === 0}
    <p class="empty">재료가 없다.</p>
  {:else}
    <ul>
      {#each items as item (item.id)}
        <li>
          <span class="name" title={item.name}>{item.name}</span>
          <time class="date" datetime={item.added_on} title={item.added_on}>{shortDate(item.added_on, clock.today)}</time>
          <span class="stepper">
            <button
              type="button"
              class="sub step"
              aria-label="{item.name} 개수 줄이기"
              disabled={item.quantity === null}
              onclick={() => setQuantity(item, decrease(item.quantity))}>−</button
            >
            <input
              class="qty"
              inputmode="numeric"
              maxlength={String(MAX_QUANTITY).length}
              placeholder="-"
              aria-label="{item.name} 개수"
              value={item.quantity ?? ""}
              onchange={(e) => commitQuantity(item, e.currentTarget)}
              onkeydown={(e) => e.key === "Enter" && e.currentTarget.blur()}
            />
            <button
              type="button"
              class="sub step"
              aria-label="{item.name} 개수 늘리기"
              disabled={item.quantity === MAX_QUANTITY}
              onclick={() => setQuantity(item, increase(item.quantity))}>+</button
            >
          </span>
          <button type="button" class="sub del" aria-label="{item.name} 삭제" onclick={() => void fridge.removeItem(item.id)}>✕</button>
        </li>
      {/each}
    </ul>
  {/if}
</section>

<style>
  .panel { display: flex; flex-direction: column; gap: 8px; }
  h2 { margin: 0; font-size: 1.05rem; }

  /* 이름 + 추가 버튼이 윗줄, 날짜 + 개수가 아랫줄. */
  .add { display: grid; grid-template-columns: 1fr auto; gap: 6px; }
  .add input { padding: 9px 10px; }
  .add button { padding: 9px 14px; }
  .date-input, .qty-input { min-width: 0; }

  ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
  li {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 5px 0;
    border-top: 1px solid var(--line);
  }
  .name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .date { flex-shrink: 0; font-size: 0.75rem; color: var(--muted); }

  .stepper { flex-shrink: 0; display: inline-flex; align-items: center; gap: 2px; }
  .step, .del { width: 28px; height: 30px; padding: 0; font-size: 1rem; line-height: 1; }
  .qty { flex: none; width: 40px; padding: 5px 2px; font-size: 0.95rem; text-align: center; }

  .empty { margin: 0; color: var(--muted); font-size: 0.9rem; }
</style>
