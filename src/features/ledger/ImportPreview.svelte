<script lang="ts">
  // 문자에서 읽은 결제를 항목으로 만들기 전에 보여 주는 확인 창의 내용. 고르고 분류를 정한 것만 추가한다.
  import { untrack } from "svelte";
  import { notice } from "../../core/notice.svelte";
  import { CATEGORIES, formatWon, type Category, type SmsCandidate, type SmsUnparsed } from "./domain";
  import type { MockSmsResult } from "./mock-sms";
  import { ledger } from "./store.svelte";

  interface Props {
    result: MockSmsResult;
    onclose: () => void;
  }

  const { result, onclose }: Props = $props();

  interface Row {
    candidate: SmsCandidate;
    checked: boolean;
    category: Category;
  }

  // 창이 열릴 때 받은 결과를 한 번만 읽는다. 열려 있는 동안 result 는 바뀌지 않는다.
  const initial = untrack(() => result);
  let rows = $state<Row[]>(initial.candidates.map((candidate) => ({ candidate, checked: true, category: candidate.category })));
  const unparsed: SmsUnparsed[] = initial.unparsed;
  const checkedCount = $derived(rows.filter((row) => row.checked).length);

  async function confirm(): Promise<void> {
    const chosen = rows.filter((row) => row.checked);
    const saved = await ledger.addEntries(
      chosen.map(({ candidate, category }) => ({
        spent_on: candidate.spent_on,
        method: candidate.method,
        category,
        amount: candidate.amount,
        memo: candidate.merchant,
        sms_key: candidate.key,
      })),
    );
    if (!saved) return;
    // 읽지 못한 안내문은 이번에 봤으니 다음 불러오기에서는 다시 보이지 않게 한다.
    ledger.dismiss(unparsed.map((item) => item.key));
    notice.say("ok", `${chosen.length}건을 추가했다.`);
    onclose();
  }
</script>

<section class="preview">
  <h2>불러온 결제 {rows.length}건</h2>
  <p class="help">추가할 결제를 고르고 분류를 정한다. 체크를 푼 문자는 다음에 다시 불러온다.</p>

  <ul class="rows">
    {#each rows as row (row.candidate.key)}
      <li class:off={!row.checked}>
        <label class="check">
          <input type="checkbox" bind:checked={row.checked} aria-label="{row.candidate.merchant} 추가" />
        </label>
        <div class="info">
          <span class="merchant">{row.candidate.merchant}{#if row.candidate.amount < 0}<em>취소</em>{/if}</span>
          <span class="meta">{row.candidate.spent_on} · {row.candidate.method}</span>
        </div>
        <select bind:value={row.category} aria-label="{row.candidate.merchant} 분류">
          {#each CATEGORIES as option (option)}
            <option value={option}>{option}</option>
          {/each}
        </select>
        <span class="amount" class:refund={row.candidate.amount < 0}>{formatWon(row.candidate.amount)}</span>
      </li>
    {/each}

    {#if unparsed.length > 0}
      <li class="group">읽지 못한 문자 {unparsed.length}건</li>
      {#each unparsed as item (item.key)}
        <li class="raw"><span class="meta">{item.method}</span><span>{item.raw}</span></li>
      {/each}
    {/if}
  </ul>

  <button type="button" class="go" disabled={checkedCount === 0} onclick={confirm}>{checkedCount}건 추가</button>
</section>

<style>
  .preview { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 8px; }
  h2 { flex-shrink: 0; margin: 0; font-size: 1.05rem; }
  .help { flex-shrink: 0; margin: 0; font-size: 0.8rem; color: var(--muted); }

  .rows { flex: 1; min-height: 0; overflow-y: auto; list-style: none; margin: 0; padding: 0; }
  li { display: flex; align-items: center; gap: 6px; padding: 6px 0; border-top: 1px solid var(--line); }
  /* 체크를 푼 줄도 흐리게(투명도) 하지 않고 글자색만 보조색으로 바꿔 읽을 수 있게 둔다. */
  li.off .merchant, li.off .amount { color: var(--muted); }

  .check { flex-shrink: 0; display: flex; }
  input[type="checkbox"] { flex: none; width: 20px; height: 20px; padding: 0; }
  .info { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  .merchant { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 0.9rem; font-weight: 700; }
  .merchant em { margin-left: 4px; font-size: 0.7rem; font-style: normal; color: var(--ok); }
  .meta { font-size: 0.72rem; color: var(--muted); }
  select {
    flex-shrink: 0;
    padding: 4px 2px;
    font-size: 0.8rem;
    color: var(--text);
    background: var(--panel);
    border: 1px solid var(--line-strong);
    border-radius: 6px;
  }
  .amount { flex: 0 0 5.2em; text-align: right; font-size: 0.85rem; font-weight: 700; font-variant-numeric: tabular-nums; }
  .amount.refund { color: var(--ok); }

  .group { padding-top: 10px; font-size: 0.8rem; font-weight: 700; color: var(--muted); }
  .raw { flex-direction: column; align-items: flex-start; gap: 0; font-size: 0.8rem; color: var(--muted); }

  .go { flex-shrink: 0; }
</style>
