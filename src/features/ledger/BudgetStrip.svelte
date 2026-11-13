<script lang="ts">
  // 목록 맨 위 요약. 첫 줄에 예산·합계·차액을 한꺼번에 보이고, 아래에는 사용률 막대만 둔다.
  import { PERF_GOAL, budgetStatus, formatWon } from "./domain";

  interface Props {
    /** 이 달 지출 합계. */
    spent: number;
    /** 이 달에 적용되는 예산. 정한 적이 없으면 null. */
    budget: number | null;
    /** 이 달에 실적으로 표시한 지출 개수. */
    perf: number;
  }

  const { spent, budget, perf }: Props = $props();

  const status = $derived(budget === null ? null : budgetStatus(spent, budget));
  const meterLabel = $derived(status ? `예산의 ${Math.round((Math.max(spent, 0) / status.budget) * 100)}% 사용` : "예산 없음");
</script>

<div class="strip" role="group" aria-label="예산 요약">
  <div class="line">
    <span class="item"><em>예산</em><strong>{status ? formatWon(status.budget) : "-"}</strong></span>
    <span class="item"><em>합계</em><strong>{formatWon(spent)}</strong></span>
    <!-- 초과는 색만으로 알리지 않는다. 차액이 음수라 금액 앞에 - 가 붙는다. -->
    <span class="item" class:over={status?.over}><em>차액</em><strong>{status ? formatWon(status.remaining) : "-"}</strong></span>
  </div>
  <div class="meter">
    <div class="track" role="img" aria-label={meterLabel}>
      <span class="fill" class:over={status?.over} style:width="{(status?.ratio ?? 0) * 100}%"></span>
    </div>
    <span class="perf" class:done={perf >= PERF_GOAL}>실적 {perf}/{PERF_GOAL}</span>
  </div>
</div>

<style>
  .strip {
    flex-shrink: 0;
    padding: 6px 8px 7px;
    margin-bottom: 6px;
    background: var(--panel);
    border: 1px solid var(--line-strong);
    border-radius: 6px;
  }
  .line { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; }
  .item { display: flex; align-items: baseline; justify-content: space-between; gap: 4px; min-width: 0; white-space: nowrap; }
  /* 앞 칸의 금액과 다음 칸의 이름이 붙어 읽히지 않도록 칸 사이에 선을 둔다. */
  .item + .item { padding-left: 6px; border-left: 1px solid var(--line-strong); }
  em { font-size: 0.7rem; font-style: normal; color: var(--muted); }
  strong { overflow: hidden; text-overflow: ellipsis; font-size: 0.85rem; font-variant-numeric: tabular-nums; }
  .over strong { color: var(--danger); }

  .meter { display: flex; align-items: center; gap: 8px; margin-top: 5px; }
  .perf { flex-shrink: 0; font-size: 0.7rem; color: var(--muted); font-variant-numeric: tabular-nums; }
  .perf.done { color: var(--accent-strong); font-weight: 700; }
  .track { flex: 1; height: 6px; background: var(--bg); border-radius: 3px; overflow: hidden; }
  .fill { display: block; height: 100%; background: var(--accent); border-radius: 3px; }
  .fill.over { background: var(--danger); }
</style>
