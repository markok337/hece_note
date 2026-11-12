// 달력 위의 손가락·마우스 움직임을 해석하는 순수 규칙.

/** 쓸어 넘기기: 달력 폭의 1/4 과 80px 중 큰 값 이상 옆으로 밀어야 한다. */
export const SWIPE_MIN_PX = 80;
export const SWIPE_WIDTH_RATIO = 0.25;
/** 위아래로 간 거리보다 이 배수 이상 옆으로 가야 한다. */
export const SWIPE_DOMINANCE = 1.5;

/** 움직임(dx, dy)이 달 넘기기에 해당하면 방향을, 아니면 null 을 돌려준다. 왼쪽으로 밀면 다음 달이다. */
export function swipeDirection(dx: number, dy: number, gridWidth: number): "prev" | "next" | null {
  const minPx = Math.max(SWIPE_MIN_PX, gridWidth * SWIPE_WIDTH_RATIO);
  if (Math.abs(dx) < minPx || Math.abs(dx) < Math.abs(dy) * SWIPE_DOMINANCE) return null;
  return dx < 0 ? "next" : "prev";
}
