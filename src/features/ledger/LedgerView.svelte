<script lang="ts">
  import { clock } from "../../core/clock.svelte";
  import { parseYmd, shiftMonth, type MonthRef } from "../../core/dates";
  import { notice } from "../../core/notice.svelte";
  import { session } from "../../core/session.svelte";
  import Modal from "../../ui/Modal.svelte";
  import BudgetStrip from "./BudgetStrip.svelte";
  import CategoryTrend from "./CategoryTrend.svelte";
  import DrillDown from "./DrillDown.svelte";
  import EntryForm from "./EntryForm.svelte";
  import EntryList from "./EntryList.svelte";
  import SmsInbox from "./SmsInbox.svelte";
  import SettingsPanel from "./SettingsPanel.svelte";
  import SettlementPanel from "./SettlementPanel.svelte";
  import { SAVINGS_CATEGORY, entriesBy, groupByDate, isCounted, monthStats, perfCount, type LedgerEntry, type SliceKind } from "./domain";
  import { canReadSms, inboxSummary, readSms } from "./sms-reader";
  import { ledger } from "./store.svelte";

  // 가계부 안의 탭. 목록은 지출 표, 결산은 한 달 정리, 통계는 분류별 월 추이, 설정은 예산·분류·카드다.
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
  let importing = $state(false);
  // 문자함의 처리 필요 문자를 보는 창.
  let inboxOpen = $state(false);
  // 문자가 안 읽힐 때 보여 주는 점검 결과. 길어서 복사할 수 있는 창에 담는다.
  let diagnosis = $state<string | null>(null);
  // 결산에서 눌러 연 이력 창. 고른 분류(또는 구분)의 이름을 가진다.
  let drill = $state<{ kind: SliceKind; label: string } | null>(null);

  const allEntries = $derived(Object.values(ledger.entries));
  const entries = $derived(ledger.entriesIn(month));
  const groups = $derived(groupByDate(entries));
  const stats = $derived(monthStats(allEntries, month));
  const budget = $derived(ledger.budgetFor(month));
  const perf = $derived(perfCount(allEntries, month));
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

  /** 점검 결과를 클립보드에 복사한다. */
  async function copyDiagnosis(): Promise<void> {
    if (diagnosis === null) return;
    try {
      await navigator.clipboard.writeText(diagnosis);
      notice.say("ok", "복사했다.");
    } catch {
      notice.say("err", "복사하지 못했다. 글을 길게 눌러 직접 복사한다.");
    }
  }

  /** 폰에서 등록한 번호의 최근 30일 문자를 읽어 문자함에 쌓고, 처리가 필요한 문자를 보여 준다. 안드로이드 앱에서만 읽는다. */
  async function startImport(): Promise<void> {
    if (!canReadSms()) {
      // 문자를 읽는 건 폰 앱뿐이지만, 폰이 쌓아 둔 문자함은 어느 기기에서든 열어 처리할 수 있다.
      if (ledger.pendingSms().length === 0) notice.say("ok", "처리할 문자가 없다. 문자는 안드로이드 앱에서 불러오면 여기에 쌓인다.");
      else inboxOpen = true;
      return;
    }
    if (ledger.cardList().length === 0) {
      notice.say("err", "먼저 설정 탭에서 카드와 발신번호를 등록한다.");
      view = "settings";
      return;
    }
    importing = true;
    try {
      const senders = ledger.cardList().map((card) => card.sender);
      const messages = await readSms(ledger.cardList());
      if (messages.length === 0) {
        // 등록한 번호의 문자가 하나도 없으면 문자함에 무엇이 있는지 알려 준다.
        diagnosis = `등록한 번호의 문자가 없다.
${await inboxSummary(senders)}`;
        return;
      }
      if (!(await ledger.receiveSms(messages))) return;
      if (ledger.pendingSms().length === 0) {
        // 읽은 문자가 이미 처리됐거나 무시된 경우다. 어디에 얼마나 있는지 점검 문구와 함께 알려 준다.
        diagnosis = `처리할 문자가 없다. 읽은 문자 ${messages.length}건, 무시한 문자 ${ledger.ignoredCount}건.
${await inboxSummary(senders)}`;
        return;
      }
      inboxOpen = true;
    } catch (err) {
      notice.say("err", `문자를 읽지 못했다: ${(err as Error).message}`);
      // 이 기기에서 못 읽어도 다른 기기가 쌓아 둔 문자는 처리할 수 있다.
      if (ledger.pendingSms().length > 0) inboxOpen = true;
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
      <BudgetStrip spent={stats.total} {budget} perf={perf} />
      <EntryList {groups} onedit={(entry) => (editing = entry)} />
    {:else if view === "settlement"}
      <SettlementPanel {stats} {budget} {perf} onpick={(kind, label) => (drill = { kind, label })} />
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

  {#if diagnosis !== null}
    <Modal label="문자 점검" onclose={() => (diagnosis = null)}>
      <div class="diagnosis">
        <textarea readonly rows="10" value={diagnosis}></textarea>
        <button type="button" onclick={copyDiagnosis}>복사</button>
      </div>
    </Modal>
  {/if}

  {#if inboxOpen}
    <Modal fixed label="처리 필요한 문자" onclose={() => (inboxOpen = false)}>
      <SmsInbox onclose={() => (inboxOpen = false)} />
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

  .diagnosis { display: flex; flex-direction: column; gap: 8px; }
  .diagnosis textarea { width: 100%; font-size: 0.8rem; resize: none; }

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
