<script lang="ts">
  // 분류 추이: 고른 분류(또는 전체)가 최근 몇 달 동안 어떻게 변했는지 막대와 표로 보여 준다.
  import type { MonthRef } from "../../core/dates";
  import { TREND_MONTHS, categoryTrend, formatShortWon, formatWon, type LedgerEntry } from "./domain";

  interface Props {
    entries: readonly LedgerEntry[];
    /** 그래프의 마지막 달. 화면 위쪽에서 고른 달이다. */
    end: MonthRef;
    /** 고를 수 있는 분류. 설정에서 지운 분류라도 이력이 있으면 들어 있다. */
    categories: readonly string[];
    /** null 이면 전체. */
    category: string | null;
    onselect: (category: string | null) => void;
  }

  const { entries, end, categories, category, onselect }: Props = $props();

  const points = $derived(categoryTrend(entries, end, category));
  const peak = $derived(Math.max(0, ...points.map((point) => point.total)));
  const average = $derived(Math.round(points.reduce((sum, point) => sum + point.total, 0) / points.length));
  /** 표는 가장 최근 달이 위. */
  const rows = $derived([...points].reverse());

  // 막대 위 글자가 칸 위로 넘치지 않도록 가장 높은 막대를 칸 높이의 80%까지만 올린다.
  const MAX_BAR_PERCENT = 80;
  const barPercent = (total: number): number => (peak > 0 ? (Math.max(total, 0) / peak) * MAX_BAR_PERCENT : 0);

  function deltaText(delta: number | null): string {
    if (delta === null || delta === 0) return "-";
    return `${delta > 0 ? "▲" : "▼"} ${formatWon(Math.abs(delta))}`;
  }
</script>

<div class="trend">
  <div class="sheet">
    <h3 class="band">
      <span>분류 추이</span>
      <span class="range">최근 {TREND_MONTHS}개월 · {points[0].label} ~ {points[points.length - 1].label}</span>
    </h3>

    <div class="chips" role="group" aria-label="분류 고르기">
      <button type="button" class="chip" class:active={category === null} aria-pressed={category === null} onclick={() => onselect(null)}>전체</button>
      {#each categories as name (name)}
        <button type="button" class="chip" class:active={category === name} aria-pressed={category === name} onclick={() => onselect(name)}>{name}</button>
      {/each}
    </div>

    <div class="chart" role="img" aria-label="{category ?? '전체'} 월별 지출 막대 그래프. 아래 표에 같은 값이 있다.">
      {#each points as point, i (point.key)}
        <div class="col" title="{point.label} {formatWon(point.total)}">
          <span class="slot">
            <span class="value">{formatShortWon(point.total)}</span>
            <span class="bar" class:current={i === points.length - 1} style:height="{barPercent(point.total)}%"></span>
          </span>
          <span class="x">{point.label}</span>
        </div>
      {/each}
    </div>

    <table>
      <thead>
        <tr><th scope="col">월</th><th scope="col" class="num">금액</th><th scope="col" class="num">전월 대비</th></tr>
      </thead>
      <tbody>
        {#each rows as point (point.key)}
          <tr>
            <th scope="row">{point.label}</th>
            <td class="num">{formatWon(point.total)}</td>
            <td class="num delta">{deltaText(point.delta)}</td>
          </tr>
        {/each}
        <tr class="avg">
          <th scope="row">월 평균</th>
          <td class="num">{formatWon(average)}</td>
          <td></td>
        </tr>
      </tbody>
    </table>
  </div>
</div>

<style>
  .trend { flex: 1; min-height: 0; overflow-y: auto; }

  /* 월 통계와 같은 표 한 장이다(.sheet, .band 는 style.css). 띠 제목 아래에 고르는 칩, 그래프, 표가 이어진다. */
  .range { font-weight: 400; font-size: 0.75rem; color: var(--text); }

  .chips { display: flex; flex-wrap: wrap; gap: 4px; padding: 8px 10px; border-bottom: 1px solid var(--line); }
  .chip {
    height: 28px;
    padding: 0 11px;
    font-size: 0.8rem;
    font-weight: 400;
    color: var(--muted);
    background: var(--panel);
    border: 1px solid var(--line-strong);
    border-radius: 14px;
  }
  .chip.active { color: var(--accent-text); background: var(--accent); border-color: var(--accent); font-weight: 700; }

  /* 막대는 얇고 끝만 둥글다. 한 가지 색이고, 고른 달(마지막 달)만 진하다. 값은 막대 위에 바로 적는다. */
  .chart { display: flex; gap: 6px; padding: 10px 10px 6px; border-bottom: 1px solid var(--line); }
  .col { flex: 1; min-width: 0; display: flex; flex-direction: column; align-items: center; gap: 3px; }
  .slot { width: 100%; height: 120px; display: flex; flex-direction: column; justify-content: flex-end; align-items: center; }
  .value { font-size: 0.7rem; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .bar {
    width: min(60%, 28px);
    min-height: 2px;
    background: color-mix(in srgb, var(--accent) 45%, white);
    border-radius: 4px 4px 0 0;
  }
  .bar.current { background: var(--accent); }
  .x { font-size: 0.75rem; color: var(--muted); }

  table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
  th, td { padding: 6px 10px; border-bottom: 1px solid var(--line); text-align: left; font-weight: 400; }
  thead th { font-size: 0.75rem; font-weight: 700; color: var(--muted); background: var(--table-head); border-bottom: 1px solid var(--line-strong); }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  .delta { color: var(--muted); }
  .avg th, .avg td { font-weight: 700; background: var(--table-head); border-bottom: 0; }
</style>
