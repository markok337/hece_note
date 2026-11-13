<script lang="ts">
  // 가운데 뜨는 창. 열리면 포커스가 안으로 들어가고, Esc 나 바깥을 누르면 닫히며, 닫히면 눌렀던 곳으로 돌아간다.
  import { tick, type Snippet } from "svelte";

  interface Props {
    label: string;
    /** true 면 안의 내용이 늘고 줄어도 창 크기가 변하지 않는다(안쪽 목록이 스크롤). */
    fixed?: boolean;
    onclose: () => void;
    children: Snippet;
  }

  const { label, fixed = false, onclose, children }: Props = $props();

  let modalEl = $state<HTMLDivElement>();

  $effect(() => {
    if (!modalEl) return;
    const opener = document.activeElement as HTMLElement | null;
    void tick().then(() => modalEl?.focus());
    return () => {
      if (opener?.isConnected) opener.focus();
    };
  });

  /** Escape 로 닫고, Tab 은 창 안에서만 돈다. */
  function onKey(event: KeyboardEvent): void {
    if (event.key === "Escape") {
      onclose();
      return;
    }
    if (event.key !== "Tab" || !modalEl) return;
    const items = [...modalEl.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled)")];
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && (active === first || active === modalEl)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }
</script>

<div class="backdrop" role="presentation" onclick={onclose}>
  <div
    class="modal"
    class:fixed
    role="dialog"
    aria-modal="true"
    aria-label={label}
    tabindex="-1"
    bind:this={modalEl}
    onclick={(e) => e.stopPropagation()}
    onkeydown={onKey}
  >
    <button type="button" class="sub close" aria-label="닫기" onclick={onclose}>✕</button>
    {@render children()}
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 50;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 12px;
    background: rgb(15 23 42 / 0.45);
  }
  .modal {
    outline: none;
    position: relative;
    width: 100%;
    max-width: 400px;
    max-height: 100%;
    overflow-y: auto;
    padding: 16px 14px 14px;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 12px;
    box-shadow: 0 8px 24px rgb(15 23 42 / 0.25);
  }
  /* 높이를 고정하고 안쪽 내용이 남는 자리를 채운다. 내용이 많으면 목록만 스크롤한다. */
  .modal.fixed { height: min(560px, 100%); display: flex; flex-direction: column; overflow: hidden; }
  .close { position: absolute; top: 8px; right: 8px; padding: 6px 10px; }

  @media (max-height: 520px) {
    .modal { max-width: 640px; }
  }
</style>
