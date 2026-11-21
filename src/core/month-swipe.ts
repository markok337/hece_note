import { swipeDirection } from "../features/blog/gestures";

/** 달을 보여 주는 영역에 블로그 달력과 같은 좌우 쓸기 동작을 붙인다. */
export function monthSwipe(node: HTMLElement, onstep: (direction: "prev" | "next") => void | boolean) {
  let start: { id: number; x: number; y: number } | null = null;
  let suppressClick = false;

  function down(event: PointerEvent): void {
    if (event.button !== 0) return;
    start = { id: event.pointerId, x: event.clientX, y: event.clientY };
  }

  function up(event: PointerEvent): void {
    if (!start || start.id !== event.pointerId) return;
    const direction = swipeDirection(event.clientX - start.x, event.clientY - start.y, node.clientWidth);
    start = null;
    if (!direction) return;
    if (onstep(direction) === false) return;
    suppressClick = true;
    setTimeout(() => (suppressClick = false), 0);
  }

  function cancel(): void { start = null; }

  function click(event: MouseEvent): void {
    if (!suppressClick) return;
    event.preventDefault();
    event.stopPropagation();
    suppressClick = false;
  }

  node.addEventListener("pointerdown", down);
  window.addEventListener("pointerup", up);
  window.addEventListener("pointercancel", cancel);
  node.addEventListener("click", click, true);
  return { destroy() {
    node.removeEventListener("pointerdown", down);
    window.removeEventListener("pointerup", up);
    window.removeEventListener("pointercancel", cancel);
    node.removeEventListener("click", click, true);
  } };
}
