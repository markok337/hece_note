<script lang="ts">
  import { clock } from "../../core/clock.svelte";
  import { notice } from "../../core/notice.svelte";
  import {
    MAX_QUANTITY,
    NAME_MAX,
    compartmentTitle,
    decrease,
    elapsedLabel,
    increase,
    parseQuantity,
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

  /** 날짜 칸을 눌러 달력 창을 연다. showPicker 를 못 쓰는 브라우저면 입력칸에 포커스만 준다. */
  function openPicker(button: HTMLButtonElement): void {
    const input = button.nextElementSibling as HTMLInputElement;
    try {
      input.showPicker();
    } catch {
      input.focus();
    }
  }

  function commitDate(item: FridgeItem, value: string): void {
    // 달력에서 지움을 눌러 비었으면 이전 날짜를 그대로 둔다.
    if (value) void fridge.setAddedOn(item.id, value);
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
    <input class="date-input" type="date" bind:value={addedOn} aria-label="추가된 날짜" />
    <input class="qty-input" inputmode="numeric" bind:value={quantityText} placeholder="개수" aria-label="개수(선택)" />
    <button type="submit">추가</button>
  </form>

  {#if items.length === 0}
    <p class="empty">재료가 없다.</p>
  {:else}
    <ul>
      {#each items as item (item.id)}
        <li>
          <span class="name" title={item.name}>{item.name}</span>
          <span class="when">
            <button
              type="button"
              class="date-btn"
              aria-label="{item.name} 추가된 날짜 {item.added_on} 바꾸기"
              onclick={(e) => openPicker(e.currentTarget)}
            >
              {item.added_on} · {elapsedLabel(item.added_on, clock.today)}
            </button>
            <!-- 날짜 고르는 창만 빌려 쓴다. 눈에는 안 보이고 위의 날짜 글자를 누르면 열린다. -->
            <input
              class="picker"
              type="date"
              tabindex="-1"
              aria-hidden="true"
              value={item.added_on}
              onchange={(e) => commitDate(item, e.currentTarget.value)}
            />
          </span>
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

  /* 이름 · 날짜 · 개수 · 추가 버튼을 한 줄에 둔다. 폭이 좁으니 칸 사이와 안쪽 여백을 줄였다. */
  .add { display: flex; gap: 3px; }
  .add input { padding: 8px 4px; font-size: 0.85rem; }
  .add button { flex-shrink: 0; padding: 8px 9px; font-size: 0.85rem; }
  /* 입력 세 칸은 폭이 같고, 추가 버튼만 제 크기를 쓴다. 날짜 칸은 폭이 좁아 글자를 조금 줄였다. */
  .add input { flex: 1 1 0; min-width: 0; }
  .add .date-input { font-size: 0.75rem; padding-left: 2px; padding-right: 2px; }
  .qty-input { text-align: center; }

  ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
  /* 재료 하나는 한 줄이다: 이름 · 날짜(+지난 날수) · 개수 · 삭제. */
  li { display: flex; align-items: center; gap: 4px; padding: 5px 0; border-top: 1px solid var(--line); }
  .name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  .when { position: relative; flex-shrink: 0; }
  .date-btn {
    padding: 0;
    font-size: 0.75rem;
    font-weight: 400;
    white-space: nowrap;
    color: var(--muted);
    background: none;
    border-bottom: 1px dotted var(--muted);
    border-radius: 0;
  }
  .picker { position: absolute; left: 0; bottom: 0; width: 100%; height: 100%; padding: 0; opacity: 0; pointer-events: none; }

  .stepper { flex-shrink: 0; display: inline-flex; align-items: center; gap: 2px; }
  .step, .del { width: 28px; height: 30px; padding: 0; font-size: 1rem; line-height: 1; }
  .qty { flex: none; width: 40px; padding: 5px 2px; font-size: 0.95rem; text-align: center; }

  .empty { margin: 0; color: var(--muted); font-size: 0.9rem; }
</style>
