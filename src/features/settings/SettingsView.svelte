<script lang="ts">
  // 설정 탭. 지금은 가계부의 예산과 분류를 다룬다. 구분(현금·카드)은 카드 등록을 따라가므로 여기서 정하지 않는다.
  import { session } from "../../core/session.svelte";
  import BudgetSettings from "./BudgetSettings.svelte";
  import CategorySettings from "./CategorySettings.svelte";
</script>

<div class="settings">
  <header>
    <h1>설정</h1>
    <span class="spacer"></span>
    <button type="button" class="sub icon" aria-label="로그아웃" onclick={() => session.logout()}>
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="M16 17l5-5-5-5" /><path d="M21 12H9" />
      </svg>
    </button>
  </header>

  <div class="body">
    <BudgetSettings />
    <CategorySettings />
  </div>
</div>

<style>
  /* 탭 화면은 부모가 남겨 준 높이 안에서만 그린다. 내용이 길면 본문만 스크롤한다. */
  .settings { flex: 1; min-height: 0; display: flex; flex-direction: column; }
  header { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; }
  h1 { margin: 0; padding-left: 4px; font-size: 1.05rem; }
  .spacer { flex: 1; }
  .icon { width: 36px; height: 36px; padding: 0; display: inline-flex; align-items: center; justify-content: center; }

  .body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 12px;
    width: 100%;
    max-width: 560px;
    margin: 0 auto;
  }
  /* 안쪽 표가 줄어들며 찌그러지지 않게 한다. 본문이 넘치면 스크롤한다. */
  .body > :global(.sheet) { flex-shrink: 0; }
</style>
