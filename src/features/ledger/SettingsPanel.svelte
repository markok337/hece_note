<script lang="ts">
  // 가계부의 설정 탭: 예산, 분류, 카드·발신번호. 구분(현금·카드)은 여기 등록한 카드 이름을 따라간다.
  import BudgetSettings from "./BudgetSettings.svelte";
  import CardManager from "./CardManager.svelte";
  import CategorySettings from "./CategorySettings.svelte";
</script>

<div class="settings">
  <BudgetSettings />
  <CategorySettings />
  <CardManager />
</div>

<style>
  /* 내용이 길면 이 안에서만 스크롤한다. 표가 줄어들며 찌그러지지 않게 높이는 내용대로 둔다. */
  .settings { flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 10px; }
  .settings > :global(.sheet) { flex-shrink: 0; }
</style>
