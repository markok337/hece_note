<script lang="ts">
  // 문자 한 통을 지출 항목으로 만드는 양식. 문자에서 읽은 값이 먼저 채워지고 못 읽은 값은 비어 있다.
  // 분류는 정해 두지 않으므로 직접 고르기 전에는 추가할 수 없다. 사용자가 고쳐 채운 값이 새 모양이면 카드의 견본으로 남긴다.
  import { untrack } from "svelte";
  import { notice } from "../../core/notice.svelte";
  import { CASH, MEMO_MAX, newSample, parseAmount, validateMemo, type SmsRow } from "./domain";
  import { guessFromSms } from "./sms-guess";
  import { ledger } from "./store.svelte";

  interface Props {
    sms: SmsRow;
    onback: () => void;
  }

  const { sms, onback }: Props = $props();

  // 입력칸은 양식이 열릴 때의 문자로 시작한다. 부모가 {#key} 로 문자마다 새로 연다.
  const initial = untrack(() => sms);
  const guess = guessFromSms(initial.body, initial.received_at);
  const card = ledger.cardList().find((item) => item.sender === initial.sender);

  let spentOn = $state(guess?.spent_on ?? "");
  let method = $state(card?.name ?? CASH);
  let amountText = $state(guess?.amount === undefined ? "" : String(guess.amount));
  let memo = $state(guess?.merchant ?? "");
  let category = $state("");

  const methods = $derived([...new Set([CASH, ...ledger.cardList().map((item) => item.name)])]);
  const categories = $derived(ledger.categories);
  let saving = $state(false);

  async function save(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    if (!spentOn) return notice.say("err", "날짜를 고른다.");
    const amount = parseAmount(amountText);
    if (!amount.ok) return notice.say("err", amount.reason);
    const memoError = validateMemo(memo);
    if (memoError) return notice.say("err", memoError);
    if (!category) return notice.say("err", "분류를 고른다.");

    saving = true;
    try {
      const saved = await ledger.addEntry({
        spent_on: spentOn,
        method,
        category,
        amount: amount.value,
        memo: memo.trim(),
        sms_key: initial.sms_key,
      });
      if (!saved) return;
      const sample = card ? newSample(initial.body, { spent_on: spentOn, amount: amount.value, merchant: memo }, guess, card.samples) : null;
      const learned = sample && card ? await ledger.addSample(card.id, sample) : false;
      notice.say("ok", learned ? "추가했다. 이 모양의 문자를 견본으로 저장했다." : "추가했다.");
      onback();
    } finally {
      saving = false;
    }
  }

  async function ignore(): Promise<void> {
    if (await ledger.ignoreSms([initial.id])) onback();
  }
</script>

<form class="form" onsubmit={save}>
  <div class="head">
    <button type="button" class="sub back" onclick={onback}>‹ 목록</button>
    <h2>문자로 지출 추가</h2>
  </div>

  <p class="body">{initial.body}</p>

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
    <span>금액</span>
    <input inputmode="numeric" bind:value={amountText} placeholder="취소는 앞에 -" />
  </label>
  <label>
    <span>메모</span>
    <input bind:value={memo} maxlength={MEMO_MAX} placeholder="가맹점 등" />
  </label>
  <label>
    <span>분류</span>
    <select bind:value={category}>
      <option value="">분류 선택</option>
      {#each categories as option (option)}
        <option value={option}>{option}</option>
      {/each}
    </select>
  </label>

  <div class="actions">
    <button type="button" class="sub" onclick={ignore}>무시</button>
    <span class="spacer"></span>
    <button type="submit" disabled={!category || saving}>추가</button>
  </div>
</form>

<style>
  .form { flex-direction: column; gap: 10px; min-height: 0; overflow-y: auto; }
  .head { display: flex; align-items: center; gap: 8px; }
  h2 { margin: 0; font-size: 1.05rem; }
  .back { padding: 4px 10px; font-size: 0.85rem; }
  .body {
    margin: 0;
    padding: 8px 10px;
    font-size: 0.85rem;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    background: var(--panel);
    border: 1px solid var(--line-strong);
    border-radius: 8px;
  }
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
</style>
