<script lang="ts">
  import { onMount } from "svelte";
  import { blog } from "./data/blog.svelte";
  import { viewport } from "./data/viewport.svelte";
  import { parseYmd, shiftMonth, todayYmd, type MonthRef } from "./domain/dates";
  import { isConfigMissing, supabase } from "./supabase";
  import Calendar from "./ui/Calendar.svelte";
  import ItemPanel from "./ui/ItemPanel.svelte";
  import Login from "./ui/Login.svelte";

  const BUILD_ID = __BUILD_ID__;

  type Phase = "checking" | "config-missing" | "login" | "calendar";

  const today = todayYmd();
  const todayMonth: MonthRef = { year: parseYmd(today).year, month: parseYmd(today).month };

  let phase = $state<Phase>("checking");
  let month = $state<MonthRef>(todayMonth);
  // 태블릿형은 항상 하나가 선택돼 있고, 모바일형은 누른 날짜가 모달로 열린다.
  let selected = $state<string | null>(null);

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

  function goToday(): void {
    month = todayMonth;
    selected = today;
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
      <div class="nav">
        <button type="button" class="sub" aria-label="이전 달" onclick={() => (month = shiftMonth(month, -1))}>‹</button>
        <h1>{month.year}년 {month.month}월</h1>
        <button type="button" class="sub" aria-label="다음 달" onclick={() => (month = shiftMonth(month, 1))}>›</button>
        <button type="button" class="sub" onclick={goToday}>오늘</button>
      </div>
      <div class="tools">
        <span class="live" class:on={blog.live}>{blog.live ? "실시간" : "끊김"}</span>
        <button type="button" class="sub" onclick={() => void blog.load()}>새로고침</button>
        <button type="button" class="sub" onclick={logout}>로그아웃</button>
      </div>
    </header>

    <div class="body">
      <div class="cal">
        <Calendar {month} {selected} onselect={(day) => (selected = day)} />
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

    <footer class="ver">빌드 {BUILD_ID}</footer>
  {/if}

  {#if blog.notice}
    <div class="toast {blog.notice.kind}" role="status">{blog.notice.text}</div>
  {/if}
</main>

<style>
  main {
    min-height: 100dvh;
    display: flex;
    flex-direction: column;
    padding: 12px 0;
  }
  header {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
  }
  .nav, .tools { display: flex; align-items: center; gap: 6px; }
  h1 { font-size: 1.15rem; margin: 0 4px; min-width: 6.5em; text-align: center; }
  header button { padding: 8px 12px; font-size: 0.9rem; }

  .body { flex: 1; display: flex; min-height: 0; }
  /* 모바일형: 달력을 화면 가운데에 둔다. */
  .cal { flex: 1; display: flex; flex-direction: column; justify-content: center; min-width: 0; }

  main.wide .body { gap: 16px; align-items: stretch; }
  main.wide .cal { justify-content: flex-start; }
  .side {
    width: 340px;
    flex-shrink: 0;
    padding: 16px;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 12px;
    overflow-y: auto;
  }

  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 50;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
    background: rgb(0 0 0 / 0.6);
  }
  .modal {
    position: relative;
    width: 100%;
    max-width: 420px;
    max-height: 90dvh;
    overflow-y: auto;
    padding: 20px 16px 16px;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 12px;
  }
  .close { position: absolute; top: 8px; right: 8px; padding: 6px 10px; }

  .live { font-size: 0.8rem; color: var(--danger); }
  .live.on { color: var(--ok); }
  .ver { margin-top: 8px; text-align: center; color: var(--muted); font-size: 0.75rem; }

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
