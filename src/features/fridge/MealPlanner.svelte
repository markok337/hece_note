<script lang="ts">
  import { clock } from "../../core/clock.svelte";
  import { notice } from "../../core/notice.svelte";
  import { monthGrid, parseYmd, shiftMonth, weekday, type MonthRef } from "../../core/dates";
  import { MEAL_LABELS, MEAL_MAX, MEAL_SLOTS, validateMeal, type MealSlot } from "./domain";
  import { fridge } from "./store.svelte";

  const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

  let month = $state<MonthRef>({ year: parseYmd(clock.today).year, month: parseYmd(clock.today).month });
  let selected = $state(clock.today);

  const weeks = $derived(monthGrid(month));
  const selectedMeal = $derived(fridge.mealOn(selected));

  function go(delta: number): void {
    month = shiftMonth(month, delta);
  }

  function goToday(): void {
    const { year, month: m } = parseYmd(clock.today);
    month = { year, month: m };
    selected = clock.today;
  }

  function pick(day: string): void {
    selected = day;
    // 다른 달의 날짜를 누르면 그 달로 넘어간다.
    const { year, month: m } = parseYmd(day);
    if (year !== month.year || m !== month.month) month = { year, month: m };
  }

  /** 입력칸 값을 확정한다. 너무 길면 이유를 알리고 저장된 값으로 되돌린다. */
  function commit(slot: MealSlot, input: HTMLInputElement): void {
    const error = validateMeal(input.value);
    if (error) {
      notice.say("err", error);
      input.value = selectedMeal?.[slot] ?? "";
      return;
    }
    void fridge.setMeal(selected, slot, input.value);
  }

  function dayLabel(day: string): string {
    const { month: m, day: d } = parseYmd(day);
    return `${m}월 ${d}일 (${WEEKDAYS[weekday(day)]})`;
  }

  /** 스크린리더용 칸 설명. */
  function describe(day: string): string {
    const meal = fridge.mealOn(day);
    const parts = [dayLabel(day)];
    if (meal?.lunch) parts.push(`점심 ${meal.lunch}`);
    if (meal?.dinner) parts.push(`저녁 ${meal.dinner}`);
    return parts.join(", ");
  }
</script>

<section class="planner">
  <div class="title">
    <h2>식단</h2>
    <button type="button" class="sub today-btn" onclick={goToday}>오늘</button>
  </div>

  <div class="nav">
    <button type="button" class="sub step" aria-label="이전 달" onclick={() => go(-1)}>‹</button>
    <strong>{month.year}년 {month.month}월</strong>
    <button type="button" class="sub step" aria-label="다음 달" onclick={() => go(1)}>›</button>
  </div>

  <div class="calendar">
    <div class="weekdays">
      {#each WEEKDAYS as name, i (name)}
        <span class:sun={i === 0} class:sat={i === 6}>{name}</span>
      {/each}
    </div>
    <div class="grid" style:grid-template-rows={`repeat(${weeks.length}, minmax(0, 1fr))`}>
      {#each weeks as week (week[0])}
        {#each week as day (day)}
          {@const meal = fridge.mealOn(day)}
          <button
            type="button"
            class="cell"
            class:other={parseYmd(day).month !== month.month}
            class:today={day === clock.today}
            class:selected={day === selected}
            aria-label={describe(day)}
            aria-pressed={day === selected}
            onclick={() => pick(day)}
          >
            <span class="num">{parseYmd(day).day}</span>
            {#if meal?.lunch}<span class="meal"><i>점</i><b>{meal.lunch}</b></span>{/if}
            {#if meal?.dinner}<span class="meal"><i>저</i><b>{meal.dinner}</b></span>{/if}
          </button>
        {/each}
      {/each}
    </div>
  </div>

  <div class="editor">
    <h3>{dayLabel(selected)}</h3>
    {#each MEAL_SLOTS as slot (slot)}
      <label>
        <span>{MEAL_LABELS[slot]}</span>
        {#key selected}
          <input
            maxlength={MEAL_MAX}
            placeholder="메뉴를 적고 엔터"
            value={selectedMeal?.[slot] ?? ""}
            onchange={(e) => commit(slot, e.currentTarget)}
            onkeydown={(e) => e.key === "Enter" && e.currentTarget.blur()}
          />
        {/key}
      </label>
    {/each}
  </div>
</section>

<style>
  .planner { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 6px; }

  /* 오른쪽 위의 닫기 버튼을 피해 한 줄로 둔다. */
  .title { flex-shrink: 0; display: flex; align-items: center; gap: 8px; padding-right: 36px; min-height: 30px; }
  h2 { margin: 0; font-size: 1.05rem; }
  .today-btn { margin-left: auto; padding: 4px 10px; font-size: 0.8rem; }

  .nav { flex-shrink: 0; display: flex; align-items: center; justify-content: center; gap: 12px; }
  .nav .step { width: 32px; height: 28px; padding: 0; font-size: 1.1rem; line-height: 1; }

  .calendar { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 3px; }
  .weekdays { display: grid; grid-template-columns: repeat(7, 1fr); text-align: center; font-size: 0.75rem; color: var(--muted); }
  .sun { color: var(--danger); }
  .sat { color: var(--accent-strong); }

  .grid { flex: 1; min-height: 0; display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 2px; }
  .cell {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 1px;
    min-width: 0;
    min-height: 0;
    padding: 2px 3px;
    overflow: hidden;
    text-align: left;
    font-weight: 400;
    color: var(--text);
    background: var(--panel);
    border: 2px solid var(--line);
    border-radius: 5px;
  }
  .cell.other { color: var(--muted); background: transparent; }
  .cell.today { border-color: var(--today); }
  .cell.selected { box-shadow: 0 0 0 2px var(--accent-strong); }
  .num { font-size: 0.72rem; font-weight: 700; line-height: 1.1; }
  .meal { display: flex; gap: 2px; min-width: 0; font-size: 0.6rem; line-height: 1.15; white-space: nowrap; }
  .meal b { min-width: 0; font-weight: 400; overflow: hidden; text-overflow: ellipsis; }
  .meal i { flex-shrink: 0; font-style: normal; font-weight: 700; color: var(--muted); }

  .editor { flex-shrink: 0; display: flex; flex-direction: column; gap: 6px; padding-top: 6px; border-top: 1px solid var(--line); }
  h3 { margin: 0; font-size: 0.9rem; }
  label { display: flex; align-items: center; gap: 8px; }
  label span { flex-shrink: 0; width: 2.2em; font-size: 0.85rem; font-weight: 700; }
  label input { flex: 1; min-width: 0; padding: 7px 8px; font-size: 0.9rem; }
</style>
