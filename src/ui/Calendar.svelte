<script lang="ts">
  import { blog } from "../data/blog.svelte";
  import { cellColor, colorLabel, hasContent, moveBlock, nextStep } from "../domain/blog";
  import { fitCellFont } from "../domain/cell-font";
  import { monthGrid, parseYmd, todayYmd, type MonthRef } from "../domain/dates";

  interface Props {
    month: MonthRef;
    selected: string | null;
    onselect: (day: string) => void;
    /** 드래그 중인 포인터가 이전/다음 달 버튼 위에 있으면 그 방향, 아니면 null. */
    onnavhover: (nav: "prev" | "next" | null) => void;
    /** 달력을 좌우로 크게 쓸었을 때 넘길 방향. 왼쪽으로 쓸면 다음 달, 오른쪽으로 쓸면 이전 달이다. */
    onmonthstep: (nav: "prev" | "next") => void;
  }

  const { month, selected, onselect, onnavhover, onmonthstep }: Props = $props();

  const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
  const LONG_PRESS_MS = 350;
  const MOUSE_DRAG_PX = 6;
  const TOUCH_CANCEL_PX = 10;
  // 쓸어 넘기기: 달력 폭의 1/4 과 80px 중 큰 값 이상 옆으로 밀어야 하고, 위아래보다 1.5배 이상 옆으로 가야 한다.
  const SWIPE_MIN_PX = 80;
  const SWIPE_WIDTH_RATIO = 0.25;
  const SWIPE_DOMINANCE = 1.5;
  // 포인터가 화면 위쪽(헤더)에 있으면 라벨을 위가 아니라 아래에 띄워 잘리지 않게 한다.
  const GHOST_FLIP_Y = 60;
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

  interface Swipe {
    pointerId: number;
    startX: number;
    startY: number;
  }

  let pending: Pending | null = null;
  let swipe: Swipe | null = null;
  let gridEl = $state<HTMLDivElement>();
  // 칸 크기에 맞춰 정한 분야·주제 글자 크기(px). 재기 전에는 CSS 기본값을 쓴다.
  let cellFont = $state<number | null>(null);
  // 이번에 누른 동안 아이템 드래그가 시작됐으면 쓸어 넘기기로 보지 않는다.
  let itemDragged = false;
  let drag = $state<{ from: string; x: number; y: number; over: string | null } | null>(null);
  // 드래그가 끝난 직후 따라오는 click 을 무시하기 위한 표시.
  let suppressClick = false;

  // 좁은 칸에서 "레시피,제품"이 단어 중간이 아니라 쉼표 뒤에서 줄바꿈되도록 한다.
  const wrapCategory = (category: string) => category.replace(",", `,${ZERO_WIDTH_SPACE}`);


  function movable(day: string): boolean {
    const item = blog.stored(day);
    return item !== null && hasContent(item);
  }

  function dayAt(x: number, y: number): string | null {
    const el = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-day]");
    return el?.dataset.day ?? null;
  }

  function navAt(x: number, y: number): "prev" | "next" | null {
    const nav = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-nav]")?.dataset.nav;
    return nav === "prev" || nav === "next" ? nav : null;
  }

  function startDrag(x: number, y: number): void {
    if (!pending) return;
    itemDragged = true;
    drag = { from: pending.from, x, y, over: dayAt(x, y) };
    onnavhover(navAt(x, y));
  }

  /** 첫 칸의 안쪽 크기를 재서 글자 크기를 다시 정한다. */
  function measureFont(): void {
    const cell = gridEl?.querySelector<HTMLElement>(".cell");
    if (!cell) return;
    const style = getComputedStyle(cell);
    const innerWidth = cell.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    const innerHeight = cell.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
    cellFont = fitCellFont(innerWidth, innerHeight);
  }

  // 화면 크기가 바뀌거나 주 수(4~6줄)가 바뀌어 칸 높이가 달라질 때마다 다시 정한다.
  $effect(() => {
    if (!gridEl || weeks.length === 0) return;
    const observer = new ResizeObserver(measureFont);
    observer.observe(gridEl);
    measureFont();
    return () => observer.disconnect();
  });

  function endSwipe(): void {
    swipe = null;
    window.removeEventListener("pointerup", onSwipeUp);
    window.removeEventListener("pointercancel", endSwipe);
  }

  function beginSwipe(event: PointerEvent): void {
    endSwipe();
    swipe = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY };
    window.addEventListener("pointerup", onSwipeUp);
    window.addEventListener("pointercancel", endSwipe);
  }

  function onSwipeUp(event: PointerEvent): void {
    const started = swipe;
    endSwipe();
    if (!started || started.pointerId !== event.pointerId || itemDragged) return;
    const dx = event.clientX - started.startX;
    const dy = event.clientY - started.startY;
    const minPx = Math.max(SWIPE_MIN_PX, (gridEl?.clientWidth ?? 0) * SWIPE_WIDTH_RATIO);
    if (Math.abs(dx) < minPx || Math.abs(dx) < Math.abs(dy) * SWIPE_DOMINANCE) return;
    suppressClick = true;
    setTimeout(() => (suppressClick = false), 0);
    onmonthstep(dx < 0 ? "next" : "prev");
  }

  function endPending(): void {
    if (pending) clearTimeout(pending.timer);
    pending = null;
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onCancel);
  }

  function onDown(event: PointerEvent, day: string): void {
    if (event.button !== 0) return;
    itemDragged = false;
    const canDrag = movable(day);
    // 마우스로 내용 있는 칸을 잡으면 아이템 이동이다. 그 밖에는 옆으로 크게 밀면 달이 넘어간다.
    if (!(canDrag && event.pointerType === "mouse")) beginSwipe(event);
    if (!canDrag) return;
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

  /** 칸 사이의 틈에서 시작해도 쓸어 넘길 수 있게 한다. 칸 위에서 시작한 건 onDown 이 처리한다. */
  function onGridDown(event: PointerEvent): void {
    if (event.button !== 0 || (event.target as HTMLElement).closest("[data-day]")) return;
    itemDragged = false;
    beginSwipe(event);
  }

  function onMove(event: PointerEvent): void {
    if (!pending || event.pointerId !== pending.pointerId) return;
    if (drag) {
      drag = { ...drag, x: event.clientX, y: event.clientY, over: dayAt(event.clientX, event.clientY) };
      onnavhover(navAt(event.clientX, event.clientY));
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
    onnavhover(null);
    if (!current) return;
    suppressClick = true;
    setTimeout(() => (suppressClick = false), 0);
    const target = dayAt(event.clientX, event.clientY);
    if (target && target !== current.from) void blog.move(current.from, target);
  }

  function onCancel(): void {
    endPending();
    drag = null;
    onnavhover(null);
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
  <div
    class="grid"
    bind:this={gridEl}
    onpointerdown={onGridDown}
    style:--cal-font={cellFont === null ? undefined : `${cellFont}px`}
    style:grid-template-rows={`repeat(${weeks.length}, minmax(0, 1fr))`}>
    {#each weeks as week (week[0])}
      {#each week as day (day)}
        {@const item = blog.stored(day)}
        {@const view = blog.view(day)}
        {@const color = cellColor(item)}
        {@const drop = dropState(day)}
        {@const step = item ? nextStep(item) : null}
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
          {#if colorLabel(color)}<span class="badge">{colorLabel(color)}</span>{/if}
          <span class="cat">{wrapCategory(view.category)}</span>
          {#if view.topic}<span class="topic">{view.topic}</span>{/if}
          {#if step}<span class="step" title={`다음 단계: ${step}`}>{step}</span>{/if}
        </button>
      {/each}
    {/each}
  </div>
</div>

{#if drag}
  {@const dragged = blog.stored(drag.from)}
  <div
    class="ghost {cellColor(dragged)}"
    class:below={drag.y < GHOST_FLIP_Y}
    style:left={`${drag.x}px`}
    style:top={`${drag.y}px`}
  >
    {dragged?.topic ?? dragged?.category}
  </div>
{/if}

<style>
  .calendar {
    width: 100%;
    flex: 1;
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
  .sat { color: var(--accent-strong); }

  .grid {
    touch-action: pan-y;
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
    min-height: 0;
    text-align: left;
    font-weight: 400;
    font-size: 0.7rem;
    line-height: 1.2;
    border: 2px solid transparent;
    border-radius: 6px;
    overflow: hidden;
    /* 안쪽 글자(분야·주제) 크기를 이 칸의 폭에 맞추기 위한 기준 상자. */
    container-type: inline-size;
    user-select: none;
    -webkit-user-select: none;
    -webkit-touch-callout: none;
  }
  .cell { --chars-per-line: 6; }
  /* 세로 밀기는 브라우저에 맡기고, 가로 밀기는 쓸어 넘기기로 받는다. */
  .cell { touch-action: pan-y; }
  .cell.movable { touch-action: none; cursor: grab; }
  .cell.white { background: var(--cell-white); color: var(--cell-dark-text); border-color: var(--cell-white-border); }
  .cell.gray { background: var(--cell-gray); color: var(--cell-gray-text); }
  .cell.blue { background: var(--cell-blue); color: var(--cell-dark-text); }
  .cell.pink { background: var(--cell-pink); color: var(--cell-dark-text); }
  .cell.other { opacity: 0.7; }
  /* 다른 달의 빈 칸은 색을 채우지 않는다. 투명도만 주면 예약(회색)과 헷갈린다. */
  .cell.other.white { opacity: 1; background: transparent; color: var(--muted); border-color: var(--line); }
  .cell.today { border-color: var(--today); }
  .cell.selected { box-shadow: 0 0 0 2px var(--accent-strong); }
  .cell.dragging { opacity: 0.4; }
  .cell.drop-ok { border-color: var(--ok); }
  .cell.drop-no { border-color: var(--danger); }

  .num { font-weight: 700; font-size: 0.8rem; }
  .badge {
    position: absolute;
    top: 3px;
    right: 4px;
    font-size: 0.65rem;
    font-weight: 700;
  }
  /* 분야·주제 글자 크기는 칸의 가로·세로에 맞춰 스크립트가 --cal-font 로 정한다(domain/cell-font.ts).
     아직 재기 전이거나 값을 못 얻으면 칸 안쪽 폭의 1/6(한글 6글자)로 대신한다. */
  .cat, .topic { font-size: var(--cal-font, min(calc(100cqw / var(--chars-per-line)), 1.5rem)); }
  .cat { word-break: keep-all; overflow-wrap: anywhere; }
  .topic {
    font-weight: 700;
    overflow: hidden;
    display: -webkit-box;
    -webkit-line-clamp: 4;
    line-clamp: 4;
    -webkit-box-orient: vertical;
    word-break: keep-all;
    overflow-wrap: anywhere;
  }

  /* 칸 맨 아래에 붙는 다음 단계. 색 위에서 가장 눈에 띄는 표시다. */
  .step {
    margin-top: auto;
    align-self: flex-start;
    flex-shrink: 0;
    max-width: 100%;
    padding: 1px 3px;
    /* 가장 긴 이름(사진촬영, 4글자)이 칸 폭에 들어가도록 칸 폭에 맞춘다. */
    font-size: min(calc(100cqw / 5), 0.8rem);
    font-weight: 800;
    line-height: 1.3;
    color: var(--step-text);
    background: var(--step-bg);
    border-radius: 4px;
    white-space: nowrap;
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
    box-shadow: 0 4px 12px rgb(15 23 42 / 0.3);
  }
  .ghost.below { transform: translate(-50%, 24px); }
  .ghost.white { background: var(--cell-white); color: var(--cell-dark-text); }
  .ghost.gray { background: var(--cell-gray); color: var(--cell-gray-text); }
  .ghost.blue { background: var(--cell-blue); color: var(--cell-dark-text); }
  .ghost.pink { background: var(--cell-pink); color: var(--cell-dark-text); }

  @media (min-width: 720px) {
    .cell { font-size: 0.8rem; padding: 4px 6px; }
    .step { padding: 1px 6px; }
    .num { font-size: 0.9rem; }
  }
</style>
