<script lang="ts">
  // 통계에서 고른 분류(또는 구분)의 이번 달 이력을 날짜별 표로 보여 주는 창의 내용. 보기만 한다.
  import EntryList from "./EntryList.svelte";
  import { SAVINGS_CATEGORY, formatWon, groupByDate, type LedgerEntry, type SliceKind } from "./domain";

  interface Props {
    kind: SliceKind;
    label: string;
    /** "2026년 11월" 꼴의 달 이름. */
    monthLabel: string;
    entries: LedgerEntry[];
  }

  const { kind, label, monthLabel, entries }: Props = $props();

  const kindLabel = $derived(kind === "category" ? "분류" : "구분");
  const total = $derived(entries.reduce((sum, entry) => sum + entry.amount, 0));
  // 예금의 이력은 하루 합계도 예금 금액으로 보여 준다.
  const groups = $derived(groupByDate(entries, kind === "category" && label === SAVINGS_CATEGORY));
</script>

<section class="drill">
  <h2>{kindLabel} · {label}</h2>
  <p class="sub-line">{monthLabel} · {entries.length}건 · 합계 <strong>{formatWon(total)}</strong></p>
  <EntryList {groups} empty="이 달에 이 {kindLabel}의 지출이 없다." />
</section>

<style>
  /* 창 크기가 고정이라 표가 남는 자리를 채우고, 줄이 많으면 표 안에서만 스크롤한다. */
  .drill { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 4px; }
  h2 { flex-shrink: 0; margin: 0; padding-right: 36px; font-size: 1.05rem; }
  .sub-line { flex-shrink: 0; margin: 0 0 4px; font-size: 0.85rem; color: var(--muted); }
  .sub-line strong { color: var(--text); font-variant-numeric: tabular-nums; }
</style>
