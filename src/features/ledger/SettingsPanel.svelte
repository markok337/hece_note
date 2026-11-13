<script lang="ts">
  // 가계부의 설정 탭: 예산과 분류. 구분(현금·카드)은 카드 등록을 따라가므로 여기서 정하지 않는다.
  import BudgetSettings from "./BudgetSettings.svelte";
  import CategorySettings from "./CategorySettings.svelte";
</script>

<div class="settings">
  <BudgetSettings />
  <CategorySettings />
</div>

<style>
  /* 내용이 길면 이 안에서만 스크롤한다. 표가 줄어들며 찌그러지지 않게 높이는 내용대로 둔다. */
  .settings { flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 10px; }
  .settings > :global(.sheet) { flex-shrink: 0; }
</style>
