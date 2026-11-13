<script lang="ts">
  // 날짜별로 묶은 지출 목록. 줄을 누르면 고치는 창이 열린다.
  import { dayLabel, formatWon, type DayGroup, type LedgerEntry } from "./domain";

  interface Props {
    groups: DayGroup[];
    onedit: (entry: LedgerEntry) => void;
  }

  const { groups, onedit }: Props = $props();
</script>

{#if groups.length === 0}
  <p class="empty">이 달의 지출이 없다.</p>
{:else}
  <div class="list">
    {#each groups as group (group.date)}
      <section>
        <h2>
          <span>{dayLabel(group.date)}</span>
          <span class="day-total">{formatWon(group.total)}</span>
        </h2>
        <ul>
          {#each group.entries as entry (entry.id)}
            <li>
              <button type="button" class="row" onclick={() => onedit(entry)}>
                <span class="category">{entry.category}</span>
                <span class="memo" title={entry.memo}>{entry.memo || "-"}</span>
                <span class="method">{entry.method}</span>
                <span class="amount" class:refund={entry.amount < 0}>{formatWon(entry.amount)}</span>
              </button>
            </li>
          {/each}
        </ul>
      </section>
    {/each}
  </div>
{/if}

<style>
  .list { flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 10px; }
  .empty { margin: 8px 0; color: var(--muted); font-size: 0.9rem; }

  h2 {
    display: flex;
    justify-content: space-between;
    margin: 0 0 2px;
    padding: 0 4px;
    font-size: 0.8rem;
    font-weight: 700;
    color: var(--muted);
  }
  ul { list-style: none; margin: 0; padding: 0; background: var(--panel); border: 1px solid var(--line); border-radius: 10px; overflow: hidden; }
  li + li { border-top: 1px solid var(--line); }

  /* 한 줄: 분류 · 메모 · 구분 · 금액. 줄 전체가 버튼이다. */
  .row {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 9px 10px;
    font-size: 0.9rem;
    font-weight: 400;
    text-align: left;
    color: var(--text);
    background: none;
    border-radius: 0;
  }
  .category { flex: 0 0 auto; min-width: 2.6em; font-size: 0.75rem; font-weight: 700; color: var(--accent-strong); }
  .memo { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .method { flex: 0 0 auto; max-width: 6em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 0.75rem; color: var(--muted); }
  .amount { flex: 0 0 auto; min-width: 5.5em; text-align: right; font-weight: 700; font-variant-numeric: tabular-nums; }
  .amount.refund { color: var(--ok); }
</style>
