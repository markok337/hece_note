<script lang="ts">
  // 한 달 통계: 합계, 예산과 차액, 분류별·구분별 막대. 한 장의 표처럼 띠 제목 아래에 줄이 이어진다.
  // 분류·구분 줄을 누르면 그 묶음의 이력을 보는 창을 연다.
  import { notice } from "../../core/notice.svelte";
  import { budgetStatus, formatWon, parseBudget, type MonthStats, type Slice, type SliceKind } from "./domain";

  interface Props {
    stats: MonthStats;
    /** 이 달에 적용되는 예산. 정한 적이 없으면 null. */
    budget: number | null;
    onbudget: (amount: number) => Promise<boolean>;
    onpick: (kind: SliceKind, label: string) => void;
  }

  const { stats, budget, onbudget, onpick }: Props = $props();

  let editing = $state(false);
  let budgetText = $state("");

  /** 지난달과 비교한 한 문장. 지난달 기록이 없으면 비교하지 않는다. */
  const comparison = $derived.by(() => {
    if (stats.previousTotal === null) return "지난달 기록이 없다.";
    const diff = stats.total - stats.previousTotal;
    if (diff === 0) return "지난달과 같다.";
    return `지난달보다 ${formatWon(Math.abs(diff))} ${diff > 0 ? "더" : "덜"} 썼다.`;
  });

  const status = $derived(budget === null ? null : budgetStatus(stats.total, budget));

  const percent = (slice: Slice): string => `${Math.round(slice.share * 100)}%`;

  function openEditor(): void {
    budgetText = budget === null ? "" : String(budget);
    editing = true;
  }

  async function saveBudget(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    const parsed = parseBudget(budgetText);
    if (!parsed.ok) return notice.say("err", parsed.reason);
    if (await onbudget(parsed.value)) editing = false;
  }
</script>

{#snippet bars(title: string, kind: SliceKind, slices: Slice[])}
  <h3 class="band">{title}</h3>
  <ul>
    {#each slices as slice (slice.label)}
      <li>
        <button type="button" class="slice" aria-label="{slice.label} 이력 보기" onclick={() => onpick(kind, slice.label)}>
          <span class="label">
            <span>{slice.label}</span>
            <span class="value">{formatWon(slice.total)} <small>{percent(slice)}</small><i aria-hidden="true">›</i></span>
          </span>
          <span class="track"><span class="fill" style:width="{slice.share * 100}%"></span></span>
        </button>
      </li>
    {/each}
  </ul>
{/snippet}

<div class="stats">
  <div class="sheet">
    <h3 class="band">이 달 합계</h3>
    <div class="cell total-cell">
      <strong class="total">{formatWon(stats.total)}</strong>
      <span class="note">{stats.count}건 · {comparison}</span>
    </div>

    <h3 class="band with-action">
      <span>예산</span>
      {#if !editing}
        <button type="button" class="sub edit" onclick={openEditor}>{budget === null ? "예산 정하기" : "수정"}</button>
      {/if}
    </h3>
    {#if editing}
      <form class="cell budget-form" onsubmit={saveBudget}>
        <input inputmode="numeric" bind:value={budgetText} placeholder="이 달 예산(원)" aria-label="이 달 예산" />
        <button type="submit">저장</button>
        <button type="button" class="sub" onclick={() => (editing = false)}>취소</button>
      </form>
      <p class="cell hint">정한 달부터 다음에 바꿀 때까지 이어진다.</p>
    {:else if status}
      <dl class="rows">
        <div><dt>예산</dt><dd>{formatWon(status.budget)}</dd></div>
        <div><dt>지출 합계</dt><dd>{formatWon(status.spent)}</dd></div>
        <div class="gap" class:over={status.over}>
          <dt>차액</dt>
          <dd>{formatWon(Math.abs(status.remaining))} {status.over ? "초과" : "남음"}</dd>
        </div>
      </dl>
      <div class="cell meter">
        <span class="track"><span class="fill" class:over={status.over} style:width="{status.ratio * 100}%"></span></span>
        <small>예산의 {Math.round((Math.max(status.spent, 0) / status.budget) * 100)}% 사용</small>
      </div>
    {:else}
      <p class="cell hint">예산을 정하면 남은 금액을 볼 수 있다.</p>
    {/if}

    {#if stats.count > 0}
      {@render bars("분류별", "category", stats.byCategory)}
      {@render bars("구분별", "method", stats.byMethod)}
    {:else}
      <p class="cell hint">이 달의 지출이 없다.</p>
    {/if}
  </div>
</div>

<style>
  .stats { flex: 1; min-height: 0; overflow-y: auto; }

  /* 표 하나. 바깥 테두리 하나와 띠 제목, 줄 사이의 가는 선만 쓴다. */
  .sheet { background: var(--panel); border: 1px solid var(--line-strong); border-radius: 6px; overflow: hidden; }
  .band {
    display: flex;
    align-items: center;
    justify-content: space-between;
    min-height: 30px;
    margin: 0;
    padding: 5px 10px;
    font-size: 0.8rem;
    font-weight: 700;
    color: var(--text);
    background: var(--table-band);
    border-top: 1px solid var(--line-strong);
    border-bottom: 1px solid var(--line-strong);
  }
  .band:first-child { border-top: 0; }
  .with-action { padding-top: 2px; padding-bottom: 2px; }
  .edit { height: 26px; padding: 0 10px; font-size: 0.8rem; }

  .cell { padding: 8px 10px; }
  .hint { margin: 0; font-size: 0.85rem; color: var(--muted); }

  .total-cell { display: flex; flex-direction: column; }
  .total { font-size: 1.6rem; line-height: 1.3; font-variant-numeric: tabular-nums; }
  .note { font-size: 0.85rem; color: var(--muted); }

  .budget-form { display: flex; gap: 6px; padding-bottom: 4px; }
  .budget-form input { padding: 8px; font-size: 0.9rem; }
  .budget-form button { flex-shrink: 0; padding: 0 12px; font-size: 0.85rem; }

  /* 예산·지출·차액은 이름 칸과 금액 칸이 있는 표 줄이다. */
  .rows { margin: 0; }
  .rows > div { display: flex; justify-content: space-between; padding: 6px 10px; border-bottom: 1px solid var(--line); font-size: 0.9rem; }
  dt { color: var(--muted); }
  dd { margin: 0; font-variant-numeric: tabular-nums; }
  .gap dt, .gap dd { font-weight: 700; color: var(--text); }
  /* 초과는 색만으로 알리지 않는다. 금액 옆에 "초과"가 붙는다. */
  .gap.over dd { color: var(--danger); }

  .meter { display: flex; flex-direction: column; gap: 3px; }
  .meter small { font-size: 0.75rem; color: var(--muted); }

  ul { list-style: none; margin: 0; padding: 0; }
  li + li { border-top: 1px solid var(--line); }
  /* 줄 하나 전체가 버튼이다. 글자는 본문 색이고, 막대 하나만 강조색이다. */
  .slice {
    display: flex;
    flex-direction: column;
    gap: 3px;
    width: 100%;
    padding: 7px 10px 8px;
    font-size: 0.9rem;
    font-weight: 400;
    text-align: left;
    color: var(--text);
    background: none;
    border-radius: 0;
  }
  .slice:hover { background: var(--row-hover); }
  .label { display: flex; justify-content: space-between; gap: 8px; }
  .value { font-variant-numeric: tabular-nums; }
  .value small { margin-left: 4px; font-size: 0.75rem; color: var(--muted); }
  .value i { margin-left: 6px; font-style: normal; color: var(--muted); }

  .track { display: block; height: 8px; background: var(--bg); border-radius: 4px; overflow: hidden; }
  .fill { display: block; height: 100%; background: var(--accent); border-radius: 4px; }
  .fill.over { background: var(--danger); }
</style>
