<script lang="ts">
  import { onMount } from "svelte";
  import { blog } from "./data/blog.svelte";
  import { viewport } from "./data/viewport.svelte";
  import { parseYmd, shiftMonth, todayYmd, type MonthRef } from "./domain/dates";
  import { isConfigMissing, supabase } from "./supabase";
  import Calendar from "./ui/Calendar.svelte";
  import ItemPanel from "./ui/ItemPanel.svelte";
  import Login from "./ui/Login.svelte";

  const APP_VERSION = __APP_VERSION__;

  // 드래그 중 이전/다음 달 버튼 위에 머물면 달이 넘어간다. 처음은 짧게, 이어서는 조금 느리게.
  const NAV_DWELL_MS = 500;
  const NAV_REPEAT_MS = 800;

  type Phase = "checking" | "config-missing" | "login" | "calendar";
  type Nav = "prev" | "next";

  const today = todayYmd();
  const todayMonth: MonthRef = { year: parseYmd(today).year, month: parseYmd(today).month };

  let phase = $state<Phase>("checking");
  let month = $state<MonthRef>(todayMonth);
  // 태블릿형은 항상 하나가 보이고(고르지 않았으면 오늘), 모바일형은 누른 날짜만 모달로 열린다.
  let selected = $state<string | null>(null);
  let hoverNav = $state<Nav | null>(null);
  let navTimer: ReturnType<typeof setTimeout> | undefined;

  const panelDay = $derived(viewport.isWide ? (selected ?? today) : selected);

  onMount(() => {
    void boot();
    const onVisible = () => {
      if (document.visibilityState === "visible" && phase === "calendar") void blog.load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  });

  async function boot(): Promise<void> {
    if (isConfigMissing || !supabase) {
      phase = "config-missing";
      return;
    }
    const { data } = await supabase.auth.getSession();
    if (data.session) await enter();
    else phase = "login";
  }

  async function enter(): Promise<void> {
    phase = "calendar";
    await blog.start();
  }

  async function logout(): Promise<void> {
    await blog.stop();
    await supabase!.auth.signOut();
    selected = null;
    phase = "login";
  }

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

<main class:wide={viewport.isWide}>
  {#if phase === "config-missing"}
    <div class="card">
      <p>Supabase 환경변수가 비어 있다. 빌드할 때 .env(또는 GitHub Secrets) 값이 필요하다. docs/setup.md 참고.</p>
    </div>
  {:else if phase === "login"}
    <Login onsuccess={enter} />
  {:else if phase === "calendar"}
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
      <button type="button" class="sub icon" aria-label="로그아웃" onclick={logout}>
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

    <footer class="ver" class:live={blog.live}>v{APP_VERSION} · {blog.live ? "실시간" : "끊김"}</footer>

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
  {/if}

  {#if blog.notice}
    <div class="toast {blog.notice.kind}" role="status">{blog.notice.text}</div>
  {/if}
</main>

<style>
  /* 앱 자체는 어떤 경우에도 스크롤하지 않는다. 남는 높이를 달력이 채운다. */
  main {
    /* 실제 보이는 높이. 값을 못 얻는 환경이면 100dvh 로 대신한다. */
    height: var(--app-height, 100dvh);
    overflow: hidden;
    display: flex;
    flex-direction: column;
    padding: calc(env(safe-area-inset-top) + 8px) 12px calc(env(safe-area-inset-bottom) + 8px);
  }
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

  /* 우하단 버전 줄. 달력은 이 줄 위까지만 차지한다. */
  .ver {
    flex-shrink: 0;
    margin-top: 4px;
    text-align: right;
    font-size: 0.65rem;
    line-height: 1.2;
    color: var(--danger);
    white-space: nowrap;
  }
  .ver.live { color: var(--muted); }

  .body { flex: 1; display: flex; min-height: 0; }
  /* 모바일형: 달력이 남는 화면 전체를 쓴다. */
  .cal { flex: 1; display: flex; flex-direction: column; min-width: 0; min-height: 0; }

  main.wide .body { gap: 12px; }
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

  .toast {
    position: fixed;
    left: 50%;
    bottom: calc(16px + env(safe-area-inset-bottom));
    transform: translateX(-50%);
    z-index: 200;
    max-width: calc(100vw - 32px);
    padding: 10px 16px;
    border-radius: 8px;
    font-size: 0.9rem;
    background: var(--panel);
    border: 1px solid var(--line);
  }
  .toast.err { color: var(--danger); border-color: var(--danger); }
  .toast.ok { color: var(--ok); border-color: var(--ok); }
</style>
