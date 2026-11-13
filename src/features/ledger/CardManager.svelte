<script lang="ts">
  // 카드 이름과 결제 문자를 보내는 번호를 등록하는 창의 내용. 문자 불러오기는 여기 등록한 번호의 문자만 읽는다.
  import { notice } from "../../core/notice.svelte";
  import { CARD_NAME_MAX, parseSender, splitSamples, validateCardName, type Card } from "./domain";
  import { ledger } from "./store.svelte";

  /** 삭제 버튼을 한 번 누른 뒤 이 시간 안에 한 번 더 눌러야 지워진다. */
  const CONFIRM_MS = 3000;

  const cards = $derived(ledger.cardList());

  let name = $state("");
  let sender = $state("");
  let sampleText = $state("");
  let confirmingId = $state<string | null>(null);
  let confirmTimer: ReturnType<typeof setTimeout> | undefined;

  $effect(() => () => clearTimeout(confirmTimer));

  async function add(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    const nameError = validateCardName(name, cards);
    if (nameError) return notice.say("err", nameError);
    const number = parseSender(sender, cards);
    if (!number.ok) return notice.say("err", number.reason);

    const saved = await ledger.addCard({ name: name.trim(), sender: number.value, samples: splitSamples(sampleText) });
    if (!saved) return;
    name = "";
    sender = "";
    sampleText = "";
  }

  /** 삭제는 두 번 눌러야 한다. 첫 번째는 버튼을 빨간 "삭제"로 바꾸기만 한다. */
  function askRemove(card: Card): void {
    clearTimeout(confirmTimer);
    if (confirmingId === card.id) {
      confirmingId = null;
      void ledger.removeCard(card.id);
      return;
    }
    confirmingId = card.id;
    confirmTimer = setTimeout(() => (confirmingId = null), CONFIRM_MS);
  }
</script>

<section class="cards">
  <h2>카드 · 발신번호</h2>
  <p class="help">여기 등록한 번호로 온 문자만 읽는다. 다른 사람과 주고받은 문자는 읽지 않는다.</p>

  <form class="add" onsubmit={add}>
    <div class="line">
      <input bind:value={name} maxlength={CARD_NAME_MAX} placeholder="카드 이름" aria-label="카드 이름" />
      <input bind:value={sender} inputmode="tel" placeholder="발신번호" aria-label="발신번호" />
    </div>
    <textarea
      bind:value={sampleText}
      rows="3"
      placeholder="결제 문자 견본 (선택). 결제·취소처럼 종류마다 하나씩, 빈 줄로 나눠 붙여 넣는다."
      aria-label="결제 문자 견본"
    ></textarea>
    <button type="submit">등록</button>
  </form>

  {#if cards.length === 0}
    <p class="empty">등록한 카드가 없다.</p>
  {:else}
    <ul>
      {#each cards as card (card.id)}
        <li>
          <span class="name" title={card.name}>{card.name}</span>
          <span class="sender">{card.sender}</span>
          <span class="count">견본 {card.samples.length}개</span>
          <button
            type="button"
            class="sub del"
            class:confirm={confirmingId === card.id}
            aria-label={confirmingId === card.id ? `${card.name} 삭제 확인` : `${card.name} 삭제`}
            onclick={() => askRemove(card)}
            onblur={() => confirmingId === card.id && (confirmingId = null)}
          >
            {confirmingId === card.id ? "삭제" : "✕"}
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</section>

<style>
  .cards { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 8px; }
  h2 { flex-shrink: 0; margin: 0; font-size: 1.05rem; }
  .help { flex-shrink: 0; margin: 0; font-size: 0.8rem; color: var(--muted); }

  .add { flex-shrink: 0; flex-direction: column; gap: 6px; }
  .line { display: flex; gap: 6px; }
  .line input { flex: 1 1 0; padding: 9px 8px; font-size: 0.9rem; }
  textarea {
    width: 100%;
    padding: 9px 8px;
    font: inherit;
    font-size: 0.85rem;
    color: var(--text);
    background: var(--panel);
    border: 1px solid var(--line-strong);
    border-radius: 8px;
    resize: none;
  }
  textarea::placeholder { color: #64748b; }
  textarea:focus-visible { outline: 2px solid var(--accent-strong); outline-offset: 1px; }
  .add button { padding: 9px 12px; font-size: 0.9rem; }

  ul { flex: 1; min-height: 0; overflow-y: auto; list-style: none; margin: 0; padding: 0; }
  li { display: flex; align-items: center; gap: 6px; padding: 6px 0; border-top: 1px solid var(--line); }
  .name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 700; }
  .sender, .count { flex-shrink: 0; font-size: 0.75rem; color: var(--muted); }
  .del { flex-shrink: 0; width: 42px; height: 30px; padding: 0; font-size: 0.85rem; line-height: 1; }
  .del.confirm { color: var(--accent-text); background: var(--danger); border-color: var(--danger); font-weight: 700; }
  .empty { margin: 0; color: var(--muted); font-size: 0.9rem; }
</style>
