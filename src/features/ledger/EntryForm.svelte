<script lang="ts">
  // 지출 한 건을 적거나 고치는 창의 내용. entry 가 있으면 고치기, 없으면 새로 적기다.
  import { untrack } from "svelte";
  import { clock } from "../../core/clock.svelte";
  import { notice } from "../../core/notice.svelte";
  import ConfirmButton from "../../ui/ConfirmButton.svelte";
  import { CASH, MEMO_MAX, defaultCategory, parseAmount, validateMemo, type LedgerEntry } from "./domain";
  import { ledger } from "./store.svelte";

  interface Props {
    entry?: LedgerEntry;
    onclose: () => void;
  }

  const { entry, onclose }: Props = $props();

  // 입력칸은 창이 열릴 때의 값으로 시작한다. 창이 열려 있는 동안 entry 가 바뀌지 않으므로(부모가 {#key} 로 새로 연다) 한 번만 읽는다.
  const initial = untrack(() => entry);

  let spentOn = $state(initial?.spent_on ?? clock.today);
  let method = $state(initial?.method ?? CASH);
  let category = $state(initial?.category ?? defaultCategory(ledger.categories));
  let amountText = $state(initial ? String(initial.amount) : "");
  let memo = $state(initial?.memo ?? "");
  let perf = $state(initial?.perf ?? false);
  // 서버 응답을 기다리는 동안 저장·삭제를 다시 누르면 같은 지출이 한 건 더 생기므로 막는다.
  let saving = $state(false);

  // 설정에서 지워진 분류나 카드로 적었던 항목을 고칠 때도 그 이름이 선택지에 남는다.
  const categories = $derived(ledger.categoryChoices(...(initial ? [initial.category] : [])));
  const methods = $derived([...new Set([CASH, ...ledger.cardList().map((card) => card.name), ...(entry ? [entry.method] : [])])]);

  async function save(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    if (saving) return;
    if (!spentOn) return notice.say("err", "날짜를 고른다.");
    const amount = parseAmount(amountText);
    if (!amount.ok) return notice.say("err", amount.reason);
    const memoError = validateMemo(memo);
    if (memoError) return notice.say("err", memoError);

    const fields = { spent_on: spentOn, method, category, amount: amount.value, memo: memo.trim(), perf };
    saving = true;
    try {
      const saved = entry ? await ledger.updateEntry(entry.id, fields) : await ledger.addEntry(fields);
      if (saved) onclose();
    } finally {
      saving = false;
    }
  }

  async function remove(): Promise<void> {
    if (!entry || saving) return;
    saving = true;
    try {
      if (await ledger.removeEntry(entry.id)) onclose();
    } finally {
      saving = false;
    }
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
      {#each categories as option (option)}
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
  <label class="check">
    <input type="checkbox" bind:checked={perf} />
    <span>실적으로 센다</span>
  </label>

  <div class="actions">
    {#if entry}
      <ConfirmButton name="이 지출" label="삭제" confirmLabel="삭제 확인" width="92px" tall onconfirm={remove} />
    {/if}
    <span class="spacer"></span>
    <button type="submit" disabled={saving}>저장</button>
  </div>
</form>

<style>
  .entry { flex-direction: column; gap: 10px; }
  h2 { margin: 0 0 2px; font-size: 1.05rem; }
  label { display: flex; align-items: center; gap: 8px; }
  label span { flex: 0 0 40px; font-size: 0.85rem; color: var(--muted); }
  label input, label select { flex: 1; min-width: 0; }
  label.check { gap: 6px; }
  label.check input { flex: 0 0 auto; width: 18px; height: 18px; margin: 0; }
  label.check span { flex: 0 1 auto; }
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
</style>
