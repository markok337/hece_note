<script lang="ts">
  import { clock } from "../../core/clock.svelte";
  import { parseYmd, shiftMonth, type MonthRef } from "../../core/dates";
  import { notice } from "../../core/notice.svelte";
  import { session } from "../../core/session.svelte";
  import Modal from "../../ui/Modal.svelte";
  import BudgetStrip from "./BudgetStrip.svelte";
  import CardManager from "./CardManager.svelte";
  import CategoryTrend from "./CategoryTrend.svelte";
  import DrillDown from "./DrillDown.svelte";
  import EntryForm from "./EntryForm.svelte";
  import EntryList from "./EntryList.svelte";
  import ImportPreview from "./ImportPreview.svelte";
  import SettingsPanel from "./SettingsPanel.svelte";
  import SettlementPanel from "./SettlementPanel.svelte";
  import { SAVINGS_CATEGORY, entriesBy, groupByDate, isCounted, monthStats, type LedgerEntry, type SliceKind } from "./domain";
  import { fetchMockSms, type MockSmsResult } from "./mock-sms";
  import { ledger } from "./store.svelte";

  // 가계부 안의 탭. 목록은 지출 표, 결산은 한 달 정리, 통계는 분류별 월 추이, 설정은 예산과 분류다.
  const VIEWS = [
    { id: "list", label: "목록" },
    { id: "settlement", label: "결산" },
    { id: "stats", label: "통계" },
    { id: "settings", label: "설정" },
  ] as const;
  type ViewId = (typeof VIEWS)[number]["id"];

  let month = $state<MonthRef>({ year: parseYmd(clock.today).year, month: parseYmd(clock.today).month });
  let view = $state<ViewId>("list");
  // 통계에서 고른 분류. null 은 전체.
  let trendCategory = $state<string | null>(null);
  // 지출 창: "new" 는 새로 적기, 항목은 고치기, null 은 닫힘.
  let editing = $state<LedgerEntry | "new" | null>(null);
  let cardsOpen = $state(false);
  let importing = $state(false);
  let importResult = $state<MockSmsResult | null>(null);
  // 결산에서 눌러 연 이력 창. 고른 분류(또는 구분)의 이름을 가진다.
  let drill = $state<{ kind: SliceKind; label: string } | null>(null);

  const allEntries = $derived(Object.values(ledger.entries));
  const entries = $derived(ledger.entriesIn(month));
  const groups = $derived(groupByDate(entries));
  const stats = $derived(monthStats(allEntries, month));
  const budget = $derived(ledger.budgetFor(month));
  const drillEntries = $derived(drill ? entriesBy(drill.kind === "category" && drill.label === SAVINGS_CATEGORY ? entries : entries.filter(isCounted), drill.kind, drill.label) : []);
  // 설정에서 지운 분류라도 이력이 있으면 통계에서 고를 수 있다.
  const trendChoices = $derived(ledger.categoryChoices(...allEntries.map((entry) => entry.category)));

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

<div class="ledger">
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
    <div class="modes" role="tablist" aria-label="가계부 화면">
      {#each VIEWS as item (item.id)}
        <button
          type="button"
          role="tab"
          id="ledger-tab-{item.id}"
          aria-controls="ledger-panel"
          class="mode"
          class:active={view === item.id}
          aria-selected={view === item.id}
          onclick={() => (view = item.id)}
        >
          {item.label}
        </button>
      {/each}
    </div>
    <span class="spacer"></span>
    <button type="button" class="add" onclick={() => (editing = "new")}>+ 지출 추가</button>
  </div>

  <!-- 넓은 화면에서도 내용이 한쪽으로 퍼지지 않게 폭을 제한하고 가운데에 둔다. -->
  <div class="content" id="ledger-panel" role="tabpanel" aria-labelledby="ledger-tab-{view}">
    {#if view === "list"}
      <BudgetStrip spent={stats.total} {budget} />
      <EntryList {groups} onedit={(entry) => (editing = entry)} />
    {:else if view === "settlement"}
      <SettlementPanel {stats} {budget} onpick={(kind, label) => (drill = { kind, label })} />
    {:else if view === "stats"}
      <CategoryTrend
        entries={allEntries}
        end={month}
        categories={trendChoices}
        category={trendCategory}
        onselect={(category) => (trendCategory = category)}
      />
    {:else}
      <SettingsPanel />
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

  .bar { flex-shrink: 0; display: flex; align-items: center; gap: 6px; margin-bottom: 8px; }
  .modes { display: flex; gap: 3px; min-width: 0; }
  .mode {
    flex-shrink: 0;
    height: 32px;
    padding: 0 11px;
    font-size: 0.85rem;
    font-weight: 400;
    color: var(--muted);
    background: var(--panel);
    border: 1px solid var(--line-strong);
    border-radius: 16px;
  }
  .mode.active { color: var(--accent-text); background: var(--accent); border-color: var(--accent); font-weight: 700; }
  .add { flex-shrink: 0; height: 34px; padding: 0 12px; font-size: 0.9rem; white-space: nowrap; }

  .content {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    width: 100%;
    max-width: 760px;
    margin: 0 auto;
  }
</style>
