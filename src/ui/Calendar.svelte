<script lang="ts">
  import { blog } from "../data/blog.svelte";
  import { cellColor, hasContent, moveBlock, type CellColor } from "../domain/blog";
  import { monthGrid, parseYmd, todayYmd, type MonthRef } from "../domain/dates";

  interface Props {
    month: MonthRef;
    selected: string | null;
    onselect: (day: string) => void;
  }

  const { month, selected, onselect }: Props = $props();

  const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
  const LONG_PRESS_MS = 350;
  const MOUSE_DRAG_PX = 6;
  const TOUCH_CANCEL_PX = 10;
  const ZERO_WIDTH_SPACE = String.fromCharCode(0x200b);

  const weeks = $derived(monthGrid(month));
  const today = todayYmd();

  interface Pending {
    from: string;
    pointerId: number;
    startX: number;
    startY: number;
    isTouch: boolean;
    timer: ReturnType<typeof setTimeout> | undefined;
  }

  let pending: Pending | null = null;
  let drag = $state<{ from: string; x: number; y: number; over: string | null } | null>(null);
  // 드래그가 끝난 직후 따라오는 click 을 무시하기 위한 표시.
  let suppressClick = false;

  // 좁은 칸에서 "레시피,제품"이 단어 중간이 아니라 쉼표 뒤에서 줄바꿈되도록 한다.
  const wrapCategory = (category: string) => category.replace(",", `,${ZERO_WIDTH_SPACE}`);

  const badge = (color: CellColor) => (color === "blue" ? "B" : color === "pink" ? "P" : "");

  function movable(day: string): boolean {
    const item = blog.stored(day);
    return item !== null && hasContent(item);
  }

  function dayAt(x: number, y: number): string | null {
    const el = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-day]");
    return el?.dataset.day ?? null;
  }

  function startDrag(x: number, y: number): void {
    if (!pending) return;
    drag = { from: pending.from, x, y, over: dayAt(x, y) };
  }

  function endPending(): void {
    if (pending) clearTimeout(pending.timer);
    pending = null;
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onCancel);
  }

  function onDown(event: PointerEvent, day: string): void {
    if (event.button !== 0 || !movable(day)) return;
    const isTouch = event.pointerType !== "mouse";
    pending = {
      from: day,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      isTouch,
      timer: isTouch
        ? setTimeout(() => startDrag(event.clientX, event.clientY), LONG_PRESS_MS)
        : undefined,
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
  }

  function onMove(event: PointerEvent): void {
    if (!pending || event.pointerId !== pending.pointerId) return;
    if (drag) {
      drag = { ...drag, x: event.clientX, y: event.clientY, over: dayAt(event.clientX, event.clientY) };
      return;
    }
    const moved = Math.hypot(event.clientX - pending.startX, event.clientY - pending.startY);
    if (pending.isTouch) {
      // 길게 누르기 전에 손가락이 움직이면 드래그 의도가 아니다.
      if (moved > TOUCH_CANCEL_PX) endPending();
    } else if (moved > MOUSE_DRAG_PX) {
      startDrag(event.clientX, event.clientY);
    }
  }

  function onUp(event: PointerEvent): void {
    if (!pending || event.pointerId !== pending.pointerId) return;
    const current = drag;
    endPending();
    drag = null;
    if (!current) return;
    suppressClick = true;
    setTimeout(() => (suppressClick = false), 0);
    const target = dayAt(event.clientX, event.clientY);
    if (target && target !== current.from) void blog.move(current.from, target);
  }

  function onCancel(): void {
    endPending();
    drag = null;
  }

  function onClick(day: string): void {
    if (suppressClick) return;
    onselect(day);
  }

  function dropState(day: string): "ok" | "no" | null {
    if (!drag || drag.over !== day || day === drag.from) return null;
    return moveBlock(blog.stored(drag.from), blog.stored(day)) ? "no" : "ok";
  }
</script>

<div class="calendar">
  <div class="weekdays">
    {#each WEEKDAYS as name, i (name)}
      <span class:sun={i === 0} class:sat={i === 6}>{name}</span>
    {/each}
  </div>
  <div class="grid" style:grid-template-rows={`repeat(${weeks.length}, 1fr)`}>
    {#each weeks as week (week[0])}
      {#each week as day (day)}
        {@const item = blog.stored(day)}
        {@const view = blog.view(day)}
        {@const color = cellColor(item)}
        {@const drop = dropState(day)}
        <button
          type="button"
          class="cell {color}"
          class:other={parseYmd(day).month !== month.month}
          class:today={day === today}
          class:selected={day === selected}
          class:movable={movable(day)}
          class:dragging={drag?.from === day}
          class:drop-ok={drop === "ok"}
          class:drop-no={drop === "no"}
          data-day={day}
          onpointerdown={(e) => onDown(e, day)}
          onclick={() => onClick(day)}
          oncontextmenu={(e) => e.preventDefault()}
        >
          <span class="num">{parseYmd(day).day}</span>
          {#if badge(color)}<span class="badge">{badge(color)}</span>{/if}
          <span class="cat">{wrapCategory(view.category)}</span>
          {#if view.topic}<span class="topic">{view.topic}</span>{/if}
        </button>
      {/each}
    {/each}
  </div>
</div>

{#if drag}
  {@const dragged = blog.stored(drag.from)}
  <div class="ghost {cellColor(dragged)}" style:left={`${drag.x}px`} style:top={`${drag.y}px`}>
    {dragged?.topic ?? dragged?.category}
  </div>
{/if}

<style>
  .calendar {
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-height: 0;
  }
  .weekdays {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    text-align: center;
    font-size: 0.8rem;
    color: var(--muted);
  }
  .sun { color: var(--danger); }
  .sat { color: var(--accent); }

  .grid {
    display: grid;
    grid-template-columns: repeat(7, minmax(0, 1fr));
    gap: 3px;
    flex: 1;
    min-height: 0;
  }

  .cell {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 1px;
    padding: 3px 4px;
    min-height: 64px;
    text-align: left;
    font-weight: 400;
    font-size: 0.7rem;
    line-height: 1.2;
    border: 2px solid transparent;
    border-radius: 6px;
    overflow: hidden;
    user-select: none;
    -webkit-user-select: none;
    -webkit-touch-callout: none;
  }
  .cell.movable { touch-action: none; cursor: grab; }
  .cell.gray { background: var(--cell-gray); color: var(--cell-gray-text); }
  .cell.blue { background: var(--cell-blue); color: var(--cell-dark-text); }
  .cell.pink { background: var(--cell-pink); color: var(--cell-dark-text); }
  .cell.other { opacity: 0.45; }
  .cell.today { border-color: var(--text); }
  .cell.selected { box-shadow: 0 0 0 2px var(--accent); }
  .cell.dragging { opacity: 0.4; }
  .cell.drop-ok { border-color: var(--ok); }
  .cell.drop-no { border-color: var(--danger); }

  .num { font-weight: 700; font-size: 0.8rem; }
  .badge {
    position: absolute;
    top: 3px;
    right: 4px;
    font-size: 0.6rem;
    font-weight: 700;
    opacity: 0.7;
  }
  .cat { opacity: 0.85; word-break: keep-all; overflow-wrap: anywhere; }
  .topic {
    font-weight: 700;
    overflow: hidden;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    word-break: keep-all;
    overflow-wrap: anywhere;
  }

  .ghost {
    position: fixed;
    z-index: 100;
    transform: translate(-50%, -120%);
    padding: 6px 10px;
    border-radius: 8px;
    font-size: 0.85rem;
    font-weight: 700;
    pointer-events: none;
    box-shadow: 0 4px 12px rgb(0 0 0 / 0.5);
  }
  .ghost.gray { background: var(--cell-gray); color: var(--cell-gray-text); }
  .ghost.blue { background: var(--cell-blue); color: var(--cell-dark-text); }
  .ghost.pink { background: var(--cell-pink); color: var(--cell-dark-text); }

  @media (min-width: 720px) {
    .cell { min-height: 84px; font-size: 0.8rem; padding: 4px 6px; }
    .num { font-size: 0.9rem; }
  }
</style>
