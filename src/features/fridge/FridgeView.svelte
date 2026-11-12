<script lang="ts">
  import { onMount } from "svelte";
  import { session } from "../../core/session.svelte";
  import { viewport } from "../../core/viewport.svelte";
  import Modal from "../../ui/Modal.svelte";
  import CompartmentCell from "./CompartmentCell.svelte";
  import CompartmentPanel from "./CompartmentPanel.svelte";
  import ShoppingList from "./ShoppingList.svelte";
  import { ZONES, compartmentTitle, type Compartment } from "./domain";
  import { fridge } from "./store.svelte";

  // 태블릿형은 항상 한 칸이 옆에 열려 있고(고르지 않았으면 첫 칸), 모바일형은 누른 칸만 모달로 열린다.
  let selected = $state<Compartment | null>(null);
  let shoppingOpen = $state(false);

  const panelCompartment = $derived(viewport.isWide ? (selected ?? ZONES[0].compartments[0]) : selected);

  // 폰에서 앱이 다시 앞으로 나올 때 놓친 변경을 가져오는 안전망.
  onMount(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") void fridge.load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  });
</script>

<div class="fridge" class:wide={viewport.isWide}>
  <header>
    <button type="button" class="sub shop" onclick={() => (shoppingOpen = true)}>
      구매목록{#if fridge.toBuy > 0}<span class="badge">{fridge.toBuy}</span>{/if}
    </button>
    <span class="spacer"></span>
    <button type="button" class="sub icon" aria-label="새로고침" onclick={() => void fridge.load()}>
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M20 11a8 8 0 1 0-2.3 5.7" /><path d="M20 4v7h-7" />
      </svg>
    </button>
    <button type="button" class="sub icon" aria-label="로그아웃" onclick={() => session.logout()}>
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="M16 17l5-5-5-5" /><path d="M21 12H9" />
      </svg>
    </button>
  </header>

  <div class="body">
    <div class="zones">
      {#each ZONES as zone (zone.id)}
        <section class="zone {zone.id}" aria-label={zone.label}>
          <h1>{zone.label}</h1>
          <div class="cells">
            {#each zone.compartments as compartment (compartment)}
              <CompartmentCell
                {compartment}
                selected={panelCompartment === compartment}
                onselect={() => (selected = compartment)}
              />
            {/each}
          </div>
        </section>
      {/each}
    </div>
    {#if viewport.isWide && panelCompartment}
      <aside class="side">
        {#key panelCompartment}
          <CompartmentPanel compartment={panelCompartment} />
        {/key}
      </aside>
    {/if}
  </div>

  {#if !viewport.isWide && panelCompartment}
    <Modal fixed label={compartmentTitle(panelCompartment)} onclose={() => (selected = null)}>
      {#key panelCompartment}
        <CompartmentPanel compartment={panelCompartment} />
      {/key}
    </Modal>
  {/if}

  {#if shoppingOpen}
    <Modal fixed label="구매목록" onclose={() => (shoppingOpen = false)}>
      <ShoppingList />
    </Modal>
  {/if}
</div>

<style>
  /* 탭 화면은 부모가 남겨 준 높이 안에서만 그린다. */
  .fridge { flex: 1; min-height: 0; display: flex; flex-direction: column; }

  header { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; }
  header button { padding: 0 12px; height: 38px; font-size: 0.9rem; white-space: nowrap; flex-shrink: 0; }
  header button.icon { width: 38px; padding: 0; display: inline-flex; align-items: center; justify-content: center; }
  .shop { display: inline-flex; align-items: center; gap: 6px; font-weight: 700; }
  .badge {
    min-width: 20px;
    padding: 0 6px;
    line-height: 20px;
    font-size: 0.75rem;
    text-align: center;
    color: var(--accent-text);
    background: var(--accent);
    border-radius: 10px;
  }
  .spacer { flex: 1; }

  .body { flex: 1; display: flex; min-height: 0; }
  .wide .body { gap: 12px; }

  /* 위(냉장고)와 아래(냉동고)가 높이를 반씩 나눈다. */
  .zones { flex: 1; min-width: 0; min-height: 0; display: grid; grid-template-rows: minmax(0, 1fr) minmax(0, 1fr); gap: 8px; }
  .zone {
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 6px 8px 8px;
    border: 1px solid var(--line-strong);
    border-radius: 12px;
  }
  .zone.fridge { background: var(--zone-fridge); }
  .zone.freezer { background: var(--zone-freezer); }
  h1 { margin: 0; font-size: 0.85rem; color: var(--muted); }
  .cells { flex: 1; min-height: 0; display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); grid-template-rows: minmax(0, 1fr); gap: 8px; }

  .side {
    width: 360px;
    flex-shrink: 0;
    padding: 14px;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 12px;
    box-shadow: var(--shadow);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  @media (max-height: 520px) {
    .side { width: 440px; padding: 10px 12px; }
  }
</style>
