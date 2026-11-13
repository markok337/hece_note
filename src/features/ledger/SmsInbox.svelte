<script lang="ts">
  // 문자함의 "처리 필요" 문자 목록. 문자를 누르면 양식이 열리고, 추가하지 않을 문자는 "무시"로 치운다.
  import { formatWon, plainBody, type SmsRow } from "./domain";
  import { guessFromSms } from "./sms-guess";
  import { ledger } from "./store.svelte";
  import SmsForm from "./SmsForm.svelte";

  interface Props {
    onclose: () => void;
  }

  const { onclose }: Props = $props();

  // 양식으로 연 문자. null 이면 목록이다.
  let selected = $state<SmsRow | null>(null);

  const cards = $derived(ledger.cardList());
  const rows = $derived(
    ledger.pendingSms().map((sms) => ({
      sms,
      text: plainBody(sms.body),
      method: cards.find((card) => card.sender === sms.sender)?.name ?? sms.sender,
      guess: guessFromSms(plainBody(sms.body), sms.received_at, cards.find((card) => card.sender === sms.sender)?.samples ?? []),
    })),
  );

  /** 양식을 닫고 목록으로 돌아간다. 처리할 문자가 더 없으면 창을 닫는다. */
  function back(): void {
    selected = null;
    if (ledger.pendingSms().length === 0) onclose();
  }
</script>

{#if selected}
  {#key selected.id}
    <SmsForm sms={selected} onback={back} />
  {/key}
{:else}
  <section class="inbox">
    <h2>처리 필요 {rows.length}건</h2>

    {#if rows.length === 0}
      <p class="empty">처리할 문자가 없다.</p>
    {:else}
      <ul class="rows">
        {#each rows as row (row.sms.id)}
          <li>
            <button type="button" class="open" aria-label="{row.guess?.merchant ?? '문자'} 추가" onclick={() => (selected = row.sms)}>
              <span class="info">
                <span class="merchant">{row.guess?.merchant ?? row.text}</span>
                <span class="meta">{row.guess?.spent_on ?? row.sms.received_at.slice(0, 10)} · {row.method}</span>
              </span>
              {#if row.guess?.amount !== undefined}
                <span class="amount" class:refund={row.guess.amount < 0}>{formatWon(row.guess.amount)}</span>
              {/if}
            </button>
            <button type="button" class="sub ignore" aria-label="무시" onclick={() => ledger.ignoreSms([row.sms.id])}>무시</button>
          </li>
        {/each}
      </ul>
    {/if}

    {#if ledger.ignoredCount > 0}
      <button type="button" class="sub" onclick={() => ledger.resetIgnored()}>무시한 문자 {ledger.ignoredCount}건 되돌리기</button>
    {/if}
  </section>
{/if}

<style>
  .inbox { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 8px; }
  h2 { flex-shrink: 0; margin: 0; font-size: 1.05rem; }
  .empty { margin: 0; color: var(--muted); font-size: 0.9rem; }

  .rows { flex: 1; min-height: 0; overflow-y: auto; list-style: none; margin: 0; padding: 0; }
  li { display: flex; align-items: center; gap: 6px; padding: 4px 0; border-top: 1px solid var(--line); }
  /* 줄 하나 전체가 양식을 여는 버튼이다. */
  .open {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 0;
    font-weight: 400;
    text-align: left;
    color: var(--text);
    background: none;
    border-radius: 0;
  }
  .info { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  .merchant { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 0.9rem; font-weight: 700; }
  .meta { font-size: 0.72rem; color: var(--muted); }
  .amount { flex: 0 0 5.2em; text-align: right; font-size: 0.85rem; font-weight: 700; font-variant-numeric: tabular-nums; }
  .amount.refund { color: var(--ok); }
  .ignore { flex-shrink: 0; padding: 4px 8px; font-size: 0.8rem; }
</style>
