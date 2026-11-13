<script lang="ts">
  // 카드 설정. 카드 이름(구분)과 결제 문자를 보내는 번호를 등록한다. 문자 불러오기는 여기 등록한 번호의 문자만 읽는다.
  import { notice } from "../../core/notice.svelte";
  import ConfirmButton from "../../ui/ConfirmButton.svelte";
  import { CARD_NAME_MAX, parseSender, validateCardName } from "./domain";
  import { ledger } from "./store.svelte";

  const cards = $derived(ledger.cardList());

  let name = $state("");
  let sender = $state("");

  async function add(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    const nameError = validateCardName(name, cards);
    if (nameError) return notice.say("err", nameError);
    const number = parseSender(sender, cards);
    if (!number.ok) return notice.say("err", number.reason);

    const saved = await ledger.addCard({ name: name.trim(), sender: number.value, samples: [] });
    if (!saved) return;
    name = "";
    sender = "";
  }
</script>

<div class="sheet">
  <h2 class="band">카드 · 발신번호</h2>
  <p class="help">여기 등록한 번호로 온 문자만 읽는다. 다른 사람과 주고받은 문자는 읽지 않는다. 카드 이름은 지출의 구분이 된다.</p>

  <form class="add" onsubmit={add}>
    <input bind:value={name} maxlength={CARD_NAME_MAX} placeholder="카드 이름" aria-label="카드 이름" />
    <input bind:value={sender} inputmode="tel" placeholder="발신번호" aria-label="발신번호" />
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
          <ConfirmButton name={card.name} onconfirm={() => ledger.removeCard(card.id)} />
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .help { margin: 0; padding: 8px 10px 0; font-size: 0.8rem; color: var(--muted); }

  .add { gap: 6px; padding: 8px 10px; border-bottom: 1px solid var(--line); }
  .add input { flex: 1 1 0; min-width: 0; padding: 9px 8px; font-size: 0.9rem; }
  .add button { flex-shrink: 0; padding: 0 16px; font-size: 0.9rem; }

  ul { list-style: none; margin: 0; padding: 0 10px; }
  li { display: flex; align-items: center; gap: 6px; padding: 6px 0; border-top: 1px solid var(--line); }
  li:first-child { border-top: 0; }
  .name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 700; }
  .sender, .count { flex-shrink: 0; font-size: 0.75rem; color: var(--muted); }
  .empty { margin: 0; padding: 8px 10px; color: var(--muted); font-size: 0.9rem; }
</style>
