<script lang="ts">
  // 날짜별로 묶은 지출을 표 하나로 보여 준다. 날짜마다 진한 띠 행이 있고(그날 합계 포함), 그 아래에 항목 줄이 이어진다.
  // onedit 이 있으면 줄을 눌러 고칠 수 있고, 없으면 보기만 하는 표다(통계의 이력 창).
  import { dayLabel, formatWon, type DayGroup, type LedgerEntry } from "./domain";

  interface Props {
    groups: DayGroup[];
    onedit?: (entry: LedgerEntry) => void;
    empty?: string;
  }

  const { groups, onedit, empty = "이 달의 지출이 없다." }: Props = $props();
</script>

{#if groups.length === 0}
  <p class="empty">{empty}</p>
{:else}
  <div class="wrap">
    <table>
      <colgroup>
        <col class="c-category" />
        <col />
        <col class="c-method" />
        <col class="c-amount" />
      </colgroup>
      <thead>
        <tr>
          <th scope="col">분류</th>
          <th scope="col">메모</th>
          <th scope="col">구분</th>
          <th scope="col" class="num">금액</th>
        </tr>
      </thead>
      {#each groups as group (group.date)}
        <tbody>
          <tr class="day">
            <th scope="colgroup" colspan="3">{dayLabel(group.date)}</th>
            <td class="num">{formatWon(group.total)}</td>
          </tr>
          {#each group.entries as entry (entry.id)}
            <!-- 줄 어디를 눌러도 열리고, 키보드로는 메모 칸의 버튼이 같은 일을 한다. -->
            <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
            <tr class="entry" class:clickable={!!onedit} onclick={() => onedit?.(entry)}>
              <td class="category">{entry.category}</td>
              <td class="memo" title={entry.memo}>
                {#if onedit}
                  <button type="button">{entry.memo || "-"}</button>
                {:else}
                  {entry.memo || "-"}
                {/if}
              </td>
              <td class="method" title={entry.method}>{entry.method}</td>
              <td class="num amount" class:refund={entry.amount < 0}>{formatWon(entry.amount)}</td>
            </tr>
          {/each}
        </tbody>
      {/each}
    </table>
  </div>
{/if}

<style>
  .empty { margin: 8px 0; color: var(--muted); font-size: 0.9rem; }

  /* 표 바깥 테두리 하나. 안쪽 스크롤은 여기서만 하고, 머리글 줄은 스크롤해도 위에 남는다. */
  .wrap {
    /* 줄이 적으면 내용 높이만큼만 차지하고, 많으면 남는 높이까지 늘어난 뒤 안에서 스크롤한다. */
    flex: 0 1 auto;
    min-height: 0;
    overflow: auto;
    background: var(--panel);
    border: 1px solid var(--line-strong);
    border-radius: 6px;
  }
  table { width: 100%; table-layout: fixed; border-collapse: separate; border-spacing: 0; font-size: 0.9rem; }
  .c-category { width: 44px; }
  .c-method { width: 68px; }
  .c-amount { width: 84px; }

  th, td {
    padding: 7px 6px;
    border-bottom: 1px solid var(--line);
    border-right: 1px solid var(--line);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    text-align: left;
  }
  tr > :last-child { border-right: 0; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }

  thead th {
    position: sticky;
    top: 0;
    z-index: 1;
    padding: 5px 6px;
    font-size: 0.75rem;
    font-weight: 700;
    color: var(--muted);
    background: var(--table-head);
    border-bottom: 1px solid var(--line-strong);
  }

  /* 날짜 띠. 항목 줄보다 진한 바탕이라 날짜가 바뀌는 자리가 바로 보인다. */
  .day th, .day td {
    padding: 5px 6px;
    font-size: 0.8rem;
    font-weight: 700;
    color: var(--text);
    background: var(--table-band);
    border-bottom: 1px solid var(--line-strong);
  }
  tbody:last-child tr:last-child > * { border-bottom: 0; }

  .category { font-size: 0.75rem; font-weight: 700; color: var(--accent-strong); }
  .method { font-size: 0.75rem; color: var(--muted); }
  .amount { font-weight: 700; }
  .amount.refund { color: var(--ok); }

  .clickable { cursor: pointer; }
  .clickable:hover > td { background: var(--row-hover); }
  .memo button {
    display: block;
    width: 100%;
    padding: 0;
    font-size: inherit;
    font-weight: 400;
    text-align: left;
    color: var(--text);
    background: none;
    border-radius: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
