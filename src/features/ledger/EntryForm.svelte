<script lang="ts">
  // 지출 한 건을 적거나 고치는 창의 내용. entry 가 있으면 고치기, 없으면 새로 적기다.
  import { untrack } from "svelte";
  import { clock } from "../../core/clock.svelte";
  import { notice } from "../../core/notice.svelte";
  import { CASH, CATEGORIES, DEFAULT_CATEGORY, MEMO_MAX, parseAmount, validateMemo, type LedgerEntry } from "./domain";
  import { ledger } from "./store.svelte";

  interface Props {
    entry?: LedgerEntry;
    onclose: () => void;
  }

  const { entry, onclose }: Props = $props();

  /** 삭제 버튼을 한 번 누른 뒤 이 시간 안에 한 번 더 눌러야 지워진다. */
  const CONFIRM_MS = 3000;

  // 입력칸은 창이 열릴 때의 값으로 시작한다. 창이 열려 있는 동안 entry 가 바뀌지 않으므로(부모가 {#key} 로 새로 연다) 한 번만 읽는다.
  const initial = untrack(() => entry);

  let spentOn = $state(initial?.spent_on ?? clock.today);
  let method = $state(initial?.method ?? CASH);
  let category = $state(initial?.category ?? DEFAULT_CATEGORY);
  let amountText = $state(initial ? String(initial.amount) : "");
  let memo = $state(initial?.memo ?? "");
  let confirming = $state(false);
  let confirmTimer: ReturnType<typeof setTimeout> | undefined;

  $effect(() => () => clearTimeout(confirmTimer));

  // 지워진 카드로 적었던 항목을 고칠 때도 그 이름이 선택지에 남는다.
  const methods = $derived([...new Set([CASH, ...ledger.cardList().map((card) => card.name), ...(entry ? [entry.method] : [])])]);

  async function save(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    if (!spentOn) return notice.say("err", "날짜를 고른다.");
    const amount = parseAmount(amountText);
    if (!amount.ok) return notice.say("err", amount.reason);
    const memoError = validateMemo(memo);
    if (memoError) return notice.say("err", memoError);

    const fields = { spent_on: spentOn, method, category, amount: amount.value, memo: memo.trim() };
    const saved = entry ? await ledger.updateEntry(entry.id, fields) : await ledger.addEntry(fields);
    if (saved) onclose();
  }

  /** 삭제는 두 번 눌러야 한다. 첫 번째는 버튼을 빨간 "삭제 확인"으로 바꾸기만 한다. */
  async function askRemove(): Promise<void> {
    clearTimeout(confirmTimer);
    if (!entry) return;
    if (confirming) {
      if (await ledger.removeEntry(entry.id)) onclose();
      return;
    }
    confirming = true;
    confirmTimer = setTimeout(() => (confirming = false), CONFIRM_MS);
  }
</script>

<form class="entry" onsubmit={save}>
  <h2>{entry ? "지출 고치기" : "지출 추가"}</h2>

  <label>
    <span>날짜</span>
    <input type="date" bind:value={spentOn} />
  </label>
  <label>
    <span>구분</span>
    <select bind:value={method}>
      {#each methods as option (option)}
        <option value={option}>{option}</option>
      {/each}
    </select>
  </label>
  <label>
    <span>분류</span>
    <select bind:value={category}>
      {#each CATEGORIES as option (option)}
        <option value={option}>{option}</option>
      {/each}
    </select>
  </label>
  <label>
    <span>금액</span>
    <input inputmode="numeric" bind:value={amountText} placeholder="환불·취소는 앞에 -" />
  </label>
  <label>
    <span>메모</span>
    <input bind:value={memo} maxlength={MEMO_MAX} placeholder="선택" />
  </label>

  <div class="actions">
    {#if entry}
      <button type="button" class="sub del" class:confirm={confirming} onclick={askRemove} onblur={() => (confirming = false)}>
        {confirming ? "삭제 확인" : "삭제"}
      </button>
    {/if}
    <span class="spacer"></span>
    <button type="submit">저장</button>
  </div>
</form>

<style>
  .entry { flex-direction: column; gap: 10px; }
  h2 { margin: 0 0 2px; font-size: 1.05rem; }
  label { display: flex; align-items: center; gap: 8px; }
  label span { flex: 0 0 40px; font-size: 0.85rem; color: var(--muted); }
  label input, label select { flex: 1; min-width: 0; }
  select {
    padding: 12px;
    font-size: 1rem;
    color: var(--text);
    background: var(--panel);
    border: 1px solid var(--line-strong);
    border-radius: 8px;
  }
  .actions { display: flex; align-items: center; gap: 8px; margin-top: 4px; }
  .spacer { flex: 1; }
  /* 확인 상태에서도 폭이 같아 줄이 흔들리지 않는다. */
  .del { width: 92px; }
  .del.confirm { color: var(--accent-text); background: var(--danger); border-color: var(--danger); font-weight: 700; }
</style>
