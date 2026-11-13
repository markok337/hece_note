<script lang="ts">
  // 문자함의 "처리 필요" 문자를 보여 주는 창의 내용. 분류를 고른 문자만 항목으로 추가하고, 추가하지 않을 문자는 무시로 치운다.
  // 값이 읽힌 문자는 날짜·금액·가맹점이 미리 채워져 있다. 읽지 못한 문자는 본문만 보인다(양식에 직접 채우는 화면은 다음 단계).
  import { notice } from "../../core/notice.svelte";
  import { formatWon, type SmsRow } from "./domain";
  import { guessFromMock, type Guess } from "./mock-sms";
  import { ledger } from "./store.svelte";

  interface Props {
    onclose: () => void;
  }

  const { onclose }: Props = $props();

  interface Row {
    sms: SmsRow;
    method: string;
    guess: Guess | null;
  }

  // 문자 id 별로 고른 분류. 고르지 않은 문자는 추가하지 않는다.
  let chosen = $state<Record<string, string>>({});

  const cards = $derived(ledger.cardList());
  const rows = $derived<Row[]>(
    ledger.pendingSms().map((sms) => ({
      sms,
      method: cards.find((card) => card.sender === sms.sender)?.name ?? sms.sender,
      guess: guessFromMock(sms.body, sms.received_at),
    })),
  );
  // 값이 모두 읽힌 문자만 추가할 수 있다. 금액·날짜가 비면 항목을 만들 수 없다.
  const complete = (row: Row): boolean => row.guess?.amount !== undefined && row.guess.spent_on !== undefined;
  const addable = $derived(rows.filter((row) => complete(row) && chosen[row.sms.id]));

  async function add(): Promise<void> {
    const targets = addable;
    const saved = await ledger.addEntries(
      targets.map(({ sms, method, guess }) => ({
        spent_on: guess!.spent_on!,
        method,
        category: chosen[sms.id],
        amount: guess!.amount!,
        memo: guess!.merchant ?? "",
        sms_key: sms.sms_key,
      })),
    );
    if (!saved) return;
    notice.say("ok", `${targets.length}건을 추가했다.`);
    if (ledger.pendingSms().length === 0) onclose();
  }
</script>

<section class="preview">
  <h2>처리 필요 {rows.length}건</h2>
  <p class="help">분류를 고른 문자만 추가한다. 추가하지 않을 문자는 무시한다. 추가하거나 무시한 문자는 다시 불러와도 나오지 않는다.</p>

  {#if rows.length === 0}
    <p class="empty">처리할 문자가 없다.</p>
  {:else}
    <ul class="rows">
      {#each rows as row (row.sms.id)}
        <li class:raw={!complete(row)}>
          <div class="info">
            <span class="merchant">
              {row.guess?.merchant ?? "읽지 못한 문자"}{#if (row.guess?.amount ?? 0) < 0}<em>취소</em>{/if}
            </span>
            <span class="meta">{row.guess?.spent_on ?? row.sms.received_at.slice(0, 10)} · {row.method}</span>
            {#if !complete(row)}<span class="body">{row.sms.body}</span>{/if}
          </div>
          {#if complete(row)}
            <select bind:value={chosen[row.sms.id]} aria-label="{row.guess?.merchant} 분류">
              <option value={undefined}>분류</option>
              {#each ledger.categories as option (option)}
                <option value={option}>{option}</option>
              {/each}
            </select>
            <span class="amount" class:refund={(row.guess?.amount ?? 0) < 0}>{formatWon(row.guess!.amount!)}</span>
          {/if}
          <button type="button" class="sub ignore" aria-label="무시" onclick={() => ledger.ignoreSms([row.sms.id])}>무시</button>
        </li>
      {/each}
    </ul>
  {/if}

  <div class="actions">
    {#if ledger.ignoredCount > 0}
      <button type="button" class="sub" onclick={() => ledger.resetIgnored()}>무시한 문자 {ledger.ignoredCount}건 되돌리기</button>
    {/if}
    <button type="button" class="go" disabled={addable.length === 0} onclick={add}>{addable.length}건 추가</button>
  </div>
</section>

<style>
  .preview { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 8px; }
  h2 { flex-shrink: 0; margin: 0; font-size: 1.05rem; }
  .help { flex-shrink: 0; margin: 0; font-size: 0.8rem; color: var(--muted); }
  .empty { margin: 0; color: var(--muted); font-size: 0.9rem; }

  .rows { flex: 1; min-height: 0; overflow-y: auto; list-style: none; margin: 0; padding: 0; }
  li { display: flex; align-items: center; gap: 6px; padding: 6px 0; border-top: 1px solid var(--line); }
  .info { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  .merchant { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 0.9rem; font-weight: 700; }
  .merchant em { margin-left: 4px; font-size: 0.7rem; font-style: normal; color: var(--ok); }
  .meta { font-size: 0.72rem; color: var(--muted); }
  .body { margin-top: 2px; font-size: 0.8rem; color: var(--muted); overflow-wrap: anywhere; }
  li.raw .merchant { color: var(--muted); }
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
  .ignore { flex-shrink: 0; padding: 4px 8px; font-size: 0.8rem; }

  .actions { flex-shrink: 0; display: flex; flex-direction: column; gap: 6px; }
</style>
