<script lang="ts">
  import { onMount } from "svelte";
  import { blog } from "../data/blog.svelte";
  import { viewport } from "../data/viewport.svelte";
  import { parseYmd, shiftMonth, todayYmd, type MonthRef } from "../domain/dates";
  import Calendar from "./Calendar.svelte";
  import ItemPanel from "./ItemPanel.svelte";

  interface Props {
    onlogout: () => void;
  }

  const { onlogout }: Props = $props();

  // 드래그 중 이전/다음 달 버튼 위에 머물면 달이 넘어간다. 처음은 짧게, 이어서는 조금 느리게.
  const NAV_DWELL_MS = 500;
  const NAV_REPEAT_MS = 800;

  type Nav = "prev" | "next";

  const today = todayYmd();
  const todayMonth: MonthRef = { year: parseYmd(today).year, month: parseYmd(today).month };

  let month = $state<MonthRef>(todayMonth);
  // 태블릿형은 항상 하나가 보이고(고르지 않았으면 오늘), 모바일형은 누른 날짜만 모달로 열린다.
  let selected = $state<string | null>(null);
  let hoverNav = $state<Nav | null>(null);
  let navTimer: ReturnType<typeof setTimeout> | undefined;

  const panelDay = $derived(viewport.isWide ? (selected ?? today) : selected);

  // 폰에서 앱이 다시 앞으로 나올 때 놓친 변경을 가져오는 안전망.
  onMount(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") void blog.load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      clearTimeout(navTimer);
    };
  });

  function step(nav: Nav): void {
    month = shiftMonth(month, nav === "prev" ? -1 : 1);
  }

  /** 오늘이 있는 달로 돌아간다. 열린 아이템은 건드리지 않는다. */
  function goToday(): void {
    month = todayMonth;
  }

  /** 드래그 중인 아이템이 이전/다음 달 버튼 위에 있는지 받아 달을 넘긴다. */
  function onNavHover(nav: Nav | null): void {
    if (nav === hoverNav) return;
    hoverNav = nav;
    clearTimeout(navTimer);
    if (!nav) return;
    const tick = () => {
      step(nav);
      navTimer = setTimeout(tick, NAV_REPEAT_MS);
    };
    navTimer = setTimeout(tick, NAV_DWELL_MS);
  }

  function closeModal(): void {
    selected = null;
  }
</script>

<div class="blog" class:wide={viewport.isWide}>
  <header>
    <button
      type="button"
      class="sub icon"
      class:drag-hover={hoverNav === "prev"}
      data-nav="prev"
      aria-label="이전 달"
      onclick={() => step("prev")}>‹</button
    >
    <h1>{month.year}년 {month.month}월</h1>
    <button
      type="button"
      class="sub icon"
      class:drag-hover={hoverNav === "next"}
      data-nav="next"
      aria-label="다음 달"
      onclick={() => step("next")}>›</button
    >
    <button type="button" class="sub today" onclick={goToday}>오늘</button>
    <span class="spacer"></span>
    <button type="button" class="sub icon" aria-label="새로고침" onclick={() => void blog.load()}>
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M20 11a8 8 0 1 0-2.3 5.7" /><path d="M20 4v7h-7" />
      </svg>
    </button>
    <button type="button" class="sub icon" aria-label="로그아웃" onclick={onlogout}>
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="M16 17l5-5-5-5" /><path d="M21 12H9" />
      </svg>
    </button>
  </header>

  <div class="body">
    <div class="cal">
      <Calendar {month} {selected} onselect={(day) => (selected = day)} onnavhover={onNavHover} />
    </div>
    {#if viewport.isWide && panelDay}
      <aside class="side">
        {#key panelDay}
          <ItemPanel day={panelDay} />
        {/key}
      </aside>
    {/if}
  </div>

  {#if !viewport.isWide && panelDay}
    <div class="backdrop" role="presentation" onclick={closeModal}>
      <div
        class="modal"
        role="dialog"
        aria-modal="true"
        tabindex="-1"
        onclick={(e) => e.stopPropagation()}
        onkeydown={(e) => e.key === "Escape" && closeModal()}
      >
        <button type="button" class="sub close" aria-label="닫기" onclick={closeModal}>✕</button>
        {#key panelDay}
          <ItemPanel day={panelDay} />
        {/key}
      </div>
    </div>
  {/if}
</div>

<style>
  /* 탭 화면은 부모가 남겨 준 높이 안에서만 그린다. */
  .blog { flex: 1; min-height: 0; display: flex; flex-direction: column; }

  header {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 6px;
  }
  header button { padding: 0 12px; height: 38px; font-size: 0.9rem; }
  header button.icon { width: 38px; padding: 0; display: inline-flex; align-items: center; justify-content: center; font-size: 1.3rem; }
  header button.drag-hover { background: var(--accent); color: #0b1220; border-color: var(--accent); }
  .spacer { flex: 1; }

  h1 { font-size: 1.1rem; margin: 0 4px; min-width: 5.5em; text-align: center; white-space: nowrap; }

  .body { flex: 1; display: flex; min-height: 0; }
  /* 모바일형: 달력이 남는 화면 전체를 쓴다. */
  .cal { flex: 1; display: flex; flex-direction: column; min-width: 0; min-height: 0; }

  .wide .body { gap: 12px; }
  .side {
    width: 320px;
    flex-shrink: 0;
    padding: 14px;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 12px;
    /* 항목이 화면에 다 들어가도록 줄여 두었지만, 아주 낮은 화면의 마지막 안전장치다. */
    overflow-y: auto;
  }

  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 50;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 12px;
    background: rgb(0 0 0 / 0.6);
  }
  .modal {
    position: relative;
    width: 100%;
    max-width: 400px;
    max-height: 100%;
    overflow-y: auto;
    padding: 16px 14px 14px;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 12px;
  }
  .close { position: absolute; top: 8px; right: 8px; padding: 6px 10px; }

  @media (max-height: 520px) {
    .side { width: 440px; padding: 10px 12px; }
    .modal { max-width: 640px; }
  }
</style>
