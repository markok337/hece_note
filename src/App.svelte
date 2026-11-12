<script lang="ts">
  import { onMount } from "svelte";
  import { blog } from "./data/blog.svelte";
  import { isConfigMissing, supabase } from "./supabase";
  import { TABS, loadTab, saveTab, type TabId } from "./tabs";
  import BlogView from "./ui/BlogView.svelte";
  import Login from "./ui/Login.svelte";

  const APP_VERSION = __APP_VERSION__;

  type Phase = "checking" | "config-missing" | "login" | "app";

  let phase = $state<Phase>("checking");
  let tab = $state<TabId>(loadTab());

  onMount(() => {
    void boot();
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
    phase = "app";
    await blog.start();
  }

  async function logout(): Promise<void> {
    await blog.stop();
    await supabase!.auth.signOut();
    phase = "login";
  }

  function selectTab(id: TabId): void {
    tab = id;
    saveTab(id);
  }
</script>

<main>
  {#if phase === "config-missing"}
    <div class="card">
      <p>Supabase 환경변수가 비어 있다. 빌드할 때 .env(또는 GitHub Secrets) 값이 필요하다. docs/setup.md 참고.</p>
    </div>
  {:else if phase === "login"}
    <Login onsuccess={enter} />
  {:else if phase === "app"}
    <!-- 탭을 추가하면 src/tabs.ts 의 목록에 더하고, 아래에 그 탭의 화면을 연결한다. -->
    {#if tab === "blog"}
      <BlogView onlogout={logout} />
    {/if}

    <footer>
      <nav class="tabs" role="tablist" aria-label="기능">
        {#each TABS as item (item.id)}
          <button
            type="button"
            role="tab"
            class="tab"
            class:active={tab === item.id}
            aria-selected={tab === item.id}
            onclick={() => selectTab(item.id)}
          >
            {item.label}
          </button>
        {/each}
      </nav>
      <span class="ver" class:live={blog.live}>v{APP_VERSION} · {blog.live ? "실시간" : "끊김"}</span>
    </footer>
  {/if}

  {#if blog.notice}
    <div class="toast {blog.notice.kind}" role="status">{blog.notice.text}</div>
  {/if}
</main>

<style>
  /* 앱 자체는 어떤 경우에도 스크롤하지 않는다. 남는 높이를 탭 화면이 채운다. */
  main {
    /* 실제 보이는 높이. 값을 못 얻는 환경이면 100dvh 로 대신한다. */
    height: var(--app-height, 100dvh);
    overflow: hidden;
    display: flex;
    flex-direction: column;
    padding: calc(env(safe-area-inset-top) + 8px) 12px calc(env(safe-area-inset-bottom) + 8px);
  }

  /* 하단 줄: 왼쪽에 탭, 오른쪽 끝에 버전. 탭 화면은 이 줄 위까지만 차지한다. */
  footer {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-top: 6px;
  }
  .tabs { display: flex; gap: 4px; min-width: 0; overflow-x: auto; scrollbar-width: none; }
  .tab {
    flex-shrink: 0;
    height: 30px;
    padding: 0 14px;
    font-size: 0.85rem;
    font-weight: 400;
    color: var(--muted);
    background: var(--panel);
    border: 1px solid var(--line-strong);
    border-radius: 15px;
  }
  .tab.active { color: var(--accent-text); background: var(--accent); border-color: var(--accent); font-weight: 700; }

  .ver {
    flex-shrink: 0;
    font-size: 0.65rem;
    line-height: 1.2;
    color: var(--danger);
    white-space: nowrap;
  }
  .ver.live { color: var(--muted); }

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
    border: 1px solid var(--line-strong);
    box-shadow: 0 4px 12px rgb(15 23 42 / 0.2);
  }
  .toast.err { color: var(--danger); border-color: var(--danger); }
  .toast.ok { color: var(--ok); border-color: var(--ok); }
</style>
