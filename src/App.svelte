<script lang="ts">
  import { onMount } from "svelte";
  import { notice } from "./core/notice.svelte";
  import { isConfigMissing, supabase } from "./supabase";
  import { FEATURES, loadTab, saveTab, type TabId } from "./tabs";
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
    await Promise.all(FEATURES.map((feature) => feature.start()));
  }

  async function logout(): Promise<void> {
    await Promise.all(FEATURES.map((feature) => feature.stop()));
    await supabase!.auth.signOut();
    phase = "login";
  }

  const activeFeature = $derived(FEATURES.find((feature) => feature.id === tab) ?? FEATURES[0]);

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
    <!-- 모든 기능 화면을 함께 올려 두고 현재 탭만 보인다. 그래서 탭을 오가도 보던 달·선택이 남는다. -->
    {#each FEATURES as feature (feature.id)}
      <div class="pane" class:hidden={feature.id !== tab}>
        <feature.view />
      </div>
    {/each}

    <footer>
      <nav class="tabs" role="tablist" aria-label="기능">
        {#each FEATURES as item (item.id)}
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
      <div class="meta">
        <button type="button" class="logout" onclick={logout}>로그아웃</button>
        <span class="ver" class:live={activeFeature.isLive()}>
          v{APP_VERSION} · {activeFeature.isLive() ? "실시간" : "끊김"}
        </span>
      </div>
    </footer>
  {/if}

  {#if notice.current}
    <div class="toast {notice.current.kind}" role="status">{notice.current.text}</div>
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

  /* 기능 화면이 남는 높이를 채운다. 현재 탭이 아니면 숨기기만 한다(화면 상태는 유지). */
  .pane { flex: 1; min-height: 0; display: flex; flex-direction: column; }
  .pane.hidden { display: none; }

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

  .meta { flex-shrink: 0; display: flex; align-items: center; gap: 10px; }
  .logout {
    height: 30px;
    padding: 0 10px;
    font-size: 0.75rem;
    font-weight: 400;
    color: var(--muted);
    background: transparent;
    border: 1px solid var(--line-strong);
    border-radius: 15px;
  }

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
