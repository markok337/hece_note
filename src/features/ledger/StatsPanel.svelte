<script lang="ts">
  // 한 달 통계: 합계, 지난달과의 차이, 분류별·구분별 막대.
  import { formatWon, type MonthStats, type Slice } from "./domain";

  interface Props {
    stats: MonthStats;
  }

  const { stats }: Props = $props();

  /** 지난달과 비교한 한 문장. 지난달 기록이 없으면 비교하지 않는다. */
  const comparison = $derived.by(() => {
    if (stats.previousTotal === null) return "지난달 기록이 없다.";
    const diff = stats.total - stats.previousTotal;
    if (diff === 0) return "지난달과 같다.";
    return `지난달보다 ${formatWon(Math.abs(diff))} ${diff > 0 ? "더" : "덜"} 썼다.`;
  });

  const percent = (slice: Slice): string => `${Math.round(slice.share * 100)}%`;
</script>

{#snippet bars(title: string, slices: Slice[])}
  <section>
    <h3>{title}</h3>
    <ul>
      {#each slices as slice (slice.label)}
        <li>
          <div class="label">
            <span>{slice.label}</span>
            <span class="value">{formatWon(slice.total)} <small>{percent(slice)}</small></span>
          </div>
          <div class="track"><div class="fill" style:width="{slice.share * 100}%"></div></div>
        </li>
      {/each}
    </ul>
  </section>
{/snippet}

<div class="stats">
  <header>
    <span class="caption">이 달 합계</span>
    <strong class="total">{formatWon(stats.total)}</strong>
    <span class="sub-line">{stats.count}건 · {comparison}</span>
  </header>

  {#if stats.count === 0}
    <p class="empty">이 달의 지출이 없다.</p>
  {:else}
    {@render bars("분류별", stats.byCategory)}
    {@render bars("구분별", stats.byMethod)}
  {/if}
</div>

<style>
  .stats { flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 14px; }
  header { display: flex; flex-direction: column; padding: 12px 14px; background: var(--panel); border: 1px solid var(--line); border-radius: 10px; }
  .caption { font-size: 0.8rem; color: var(--muted); }
  .total { font-size: 1.6rem; line-height: 1.3; font-variant-numeric: tabular-nums; }
  .sub-line { font-size: 0.85rem; color: var(--muted); }
  .empty { margin: 0; color: var(--muted); font-size: 0.9rem; }

  section { padding: 10px 14px 12px; background: var(--panel); border: 1px solid var(--line); border-radius: 10px; }
  h3 { margin: 0 0 8px; font-size: 0.85rem; color: var(--muted); }
  ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 9px; }

  /* 글자는 본문 색이고, 막대 하나만 강조색이다. 막대는 얇고 끝만 둥글다. */
  .label { display: flex; justify-content: space-between; gap: 8px; font-size: 0.9rem; }
  .value { font-variant-numeric: tabular-nums; }
  .value small { margin-left: 4px; font-size: 0.75rem; color: var(--muted); }
  .track { height: 8px; margin-top: 3px; background: var(--bg); border-radius: 4px; overflow: hidden; }
  .fill { height: 100%; min-width: 0; background: var(--accent); border-radius: 4px; }
</style>
