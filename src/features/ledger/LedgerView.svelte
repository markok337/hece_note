<script lang="ts">
  import { clock } from "../../core/clock.svelte";
  import { parseYmd, shiftMonth, type MonthRef } from "../../core/dates";
  import { notice } from "../../core/notice.svelte";
  import { session } from "../../core/session.svelte";
  import { viewport } from "../../core/viewport.svelte";
  import Modal from "../../ui/Modal.svelte";
  import CardManager from "./CardManager.svelte";
  import DrillDown from "./DrillDown.svelte";
  import EntryForm from "./EntryForm.svelte";
  import EntryList from "./EntryList.svelte";
  import ImportPreview from "./ImportPreview.svelte";
  import StatsPanel from "./StatsPanel.svelte";
  import { entriesBy, formatWon, groupByDate, monthStats, type LedgerEntry, type SliceKind } from "./domain";
  import { fetchMockSms, type MockSmsResult } from "./mock-sms";
  import { ledger } from "./store.svelte";

  type Mode = "list" | "stats";

  let month = $state<MonthRef>({ year: parseYmd(clock.today).year, month: parseYmd(clock.today).month });
  // 좁은 화면은 목록과 통계를 번갈아 보고, 넓은 화면은 둘을 나란히 둔다.
  let mode = $state<Mode>("list");
  // 지출 창: "new" 는 새로 적기, 항목은 고치기, null 은 닫힘.
  let editing = $state<LedgerEntry | "new" | null>(null);
  let cardsOpen = $state(false);
  let importing = $state(false);
  let importResult = $state<MockSmsResult | null>(null);
  // 통계에서 눌러 연 이력 창. 고른 분류(또는 구분)의 이름을 가진다.
  let drill = $state<{ kind: SliceKind; label: string } | null>(null);

  const entries = $derived(ledger.entriesIn(month));
  const groups = $derived(groupByDate(entries));
  const stats = $derived(monthStats(Object.values(ledger.entries), month));
  const budget = $derived(ledger.budgetFor(month));
  const drillEntries = $derived(drill ? entriesBy(entries, drill.kind, drill.label) : []);

  function step(delta: number): void {
    month = shiftMonth(month, delta);
  }

  /** 오늘이 있는 달로 돌아간다. */
  function goToday(): void {
    month = { year: parseYmd(clock.today).year, month: parseYmd(clock.today).month };
  }

  /** 등록한 번호의 새 결제 문자를 불러와 확인 창을 연다. 지금은 모의 문자를 쓴다. */
  async function startImport(): Promise<void> {
    if (ledger.cardList().length === 0) {
      notice.say("err", "먼저 카드와 발신번호를 등록한다.");
      cardsOpen = true;
      return;
    }
    importing = true;
    try {
      const result = await fetchMockSms(ledger.cardList(), ledger.knownSmsKeys(), clock.today);
      if (result.candidates.length === 0 && result.unparsed.length === 0) {
        notice.say("ok", "새 결제 문자가 없다.");
        return;
      }
      importResult = result;
    } finally {
      importing = false;
    }
  }
</script>

<div class="ledger" class:wide={viewport.isWide}>
  <header>
    <button type="button" class="sub icon" aria-label="이전 달" onclick={() => step(-1)}>‹</button>
    <button type="button" class="title" aria-label="이번 달로" onclick={goToday}>{month.year}년 {month.month}월</button>
    <button type="button" class="sub icon" aria-label="다음 달" onclick={() => step(1)}>›</button>
    <span class="spacer"></span>
    <button type="button" class="sub import" aria-label="문자 불러오기" disabled={importing} onclick={startImport}>
      {importing ? "불러오는 중…" : "불러오기"}
    </button>
    <button type="button" class="sub icon" aria-label="카드 · 발신번호" onclick={() => (cardsOpen = true)}>
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20" />
      </svg>
    </button>
    <button type="button" class="sub icon" aria-label="로그아웃" onclick={() => session.logout()}>
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="M16 17l5-5-5-5" /><path d="M21 12H9" />
      </svg>
    </button>
  </header>

  <div class="bar">
    {#if !viewport.isWide}
      <div class="modes" role="group" aria-label="보기">
        <button type="button" class="mode" class:active={mode === "list"} aria-pressed={mode === "list"} onclick={() => (mode = "list")}>목록</button>
        <button type="button" class="mode" class:active={mode === "stats"} aria-pressed={mode === "stats"} onclick={() => (mode = "stats")}>통계</button>
      </div>
      {#if mode === "list"}
        <span class="sum">합계 <strong>{formatWon(stats.total)}</strong></span>
      {/if}
    {/if}
    <span class="spacer"></span>
    <button type="button" class="add" onclick={() => (editing = "new")}>+ 지출 추가</button>
  </div>

  <div class="body">
    {#if viewport.isWide || mode === "list"}
      <div class="main"><EntryList {groups} onedit={(entry) => (editing = entry)} /></div>
    {/if}
    {#if viewport.isWide || mode === "stats"}
      <aside class="side" class:full={!viewport.isWide}>
        <StatsPanel
          {stats}
          {budget}
          onbudget={(amount) => ledger.setBudget(month, amount)}
          onpick={(kind, label) => (drill = { kind, label })}
        />
      </aside>
    {/if}
  </div>

  {#if editing}
    <Modal label={editing === "new" ? "지출 추가" : "지출 고치기"} onclose={() => (editing = null)}>
      {#key editing}
        <EntryForm entry={editing === "new" ? undefined : editing} onclose={() => (editing = null)} />
      {/key}
    </Modal>
  {/if}

  {#if drill}
    <Modal fixed label="{drill.label} 이력" onclose={() => (drill = null)}>
      <DrillDown kind={drill.kind} label={drill.label} monthLabel="{month.year}년 {month.month}월" entries={drillEntries} />
    </Modal>
  {/if}

  {#if cardsOpen}
    <Modal fixed label="카드 · 발신번호" onclose={() => (cardsOpen = false)}>
      <CardManager />
    </Modal>
  {/if}

  {#if importResult}
    <Modal fixed label="불러온 결제" onclose={() => (importResult = null)}>
      <ImportPreview result={importResult} onclose={() => (importResult = null)} />
    </Modal>
  {/if}
</div>

<style>
  /* 탭 화면은 부모가 남겨 준 높이 안에서만 그린다. */
  .ledger { flex: 1; min-height: 0; display: flex; flex-direction: column; }

  /* 폭 360px 에서도 한 줄에 들어가도록 다른 탭보다 버튼이 조금 작다. */
  header { display: flex; align-items: center; gap: 5px; margin-bottom: 6px; }
  header button { padding: 0 10px; height: 36px; font-size: 0.9rem; white-space: nowrap; flex-shrink: 0; }
  header button.icon { width: 34px; padding: 0; display: inline-flex; align-items: center; justify-content: center; }
  .title { padding: 0 2px; font-size: 1rem; font-weight: 700; color: var(--text); background: none; }
  .spacer { flex: 1; }
  .import { font-weight: 700; }

  .bar { flex-shrink: 0; display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
  .modes { display: flex; gap: 4px; }
  .mode {
    height: 32px;
    padding: 0 14px;
    font-size: 0.85rem;
    font-weight: 400;
    color: var(--muted);
    background: var(--panel);
    border: 1px solid var(--line-strong);
    border-radius: 16px;
  }
  .mode.active { color: var(--accent-text); background: var(--accent); border-color: var(--accent); font-weight: 700; }
  .sum { font-size: 0.85rem; color: var(--muted); white-space: nowrap; }
  .sum strong { color: var(--text); font-variant-numeric: tabular-nums; }
  .add { height: 34px; padding: 0 14px; font-size: 0.9rem; white-space: nowrap; }

  .body { flex: 1; display: flex; min-height: 0; }
  .wide .body { gap: 12px; }
  .main { flex: 1; min-width: 0; min-height: 0; display: flex; flex-direction: column; }
  .side { width: 340px; flex-shrink: 0; min-height: 0; display: flex; flex-direction: column; }
  .side.full { width: auto; flex: 1; min-width: 0; }
</style>
