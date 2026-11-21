import { swipeDirection } from "../features/blog/gestures";

/** 달을 보여 주는 영역에 블로그 달력과 같은 좌우 쓸기 동작을 붙인다. */
export function monthSwipe(node: HTMLElement, onstep: (direction: "prev" | "next") => void | boolean) {
  let start: { id: number; x: number; y: number } | null = null;
  let touchStart: { id: number; x: number; y: number } | null = null;
  let suppressClick = false;

  function finish(x: number, y: number, fromX: number, fromY: number): void {
    // 넓은 목록과 달력에서도 손가락 한 번으로 넘길 수 있도록 판정 폭을 제한한다.
    const direction = swipeDirection(x - fromX, y - fromY, Math.min(node.clientWidth, 400));
    if (!direction || onstep(direction) === false) return;
    suppressClick = true;
    setTimeout(() => (suppressClick = false), 0);
  }

  function down(event: PointerEvent): void {
    if (event.button !== 0 || event.pointerType === "touch") return;
    start = { id: event.pointerId, x: event.clientX, y: event.clientY };
  }

  function up(event: PointerEvent): void {
    if (!start || start.id !== event.pointerId) return;
    const from = start;
    start = null;
    finish(event.clientX, event.clientY, from.x, from.y);
  }

  function cancel(): void { start = null; }

  function touchDown(event: TouchEvent): void {
    if (event.touches.length !== 1) { touchStart = null; return; }
    const touch = event.touches[0];
    touchStart = { id: touch.identifier, x: touch.clientX, y: touch.clientY };
  }

  function touchUp(event: TouchEvent): void {
    if (!touchStart) return;
    const touch = Array.from(event.changedTouches).find((item) => item.identifier === touchStart?.id);
    if (!touch) return;
    const from = touchStart;
    touchStart = null;
    finish(touch.clientX, touch.clientY, from.x, from.y);
  }

  function touchCancel(): void { touchStart = null; }

  function click(event: MouseEvent): void {
    if (!suppressClick) return;
    event.preventDefault();
    event.stopPropagation();
    suppressClick = false;
  }

  node.addEventListener("pointerdown", down);
  node.addEventListener("touchstart", touchDown, { passive: true });
  window.addEventListener("pointerup", up);
  window.addEventListener("pointercancel", cancel);
  window.addEventListener("touchend", touchUp);
  window.addEventListener("touchcancel", touchCancel);
  node.addEventListener("click", click, true);
  return { destroy() {
    node.removeEventListener("pointerdown", down);
    node.removeEventListener("touchstart", touchDown);
    window.removeEventListener("pointerup", up);
    window.removeEventListener("pointercancel", cancel);
    window.removeEventListener("touchend", touchUp);
    window.removeEventListener("touchcancel", touchCancel);
    node.removeEventListener("click", click, true);
  } };
}
