// 달력 칸 안의 분야·주제 글자 크기를 칸의 가로·세로에 맞춰 정한다.
//
// 기본은 칸 안쪽 폭의 1/6(한글 6글자가 한 줄에 들어가는 크기)이다.
// 그런데 폰처럼 칸이 홀쭉하면 폭이 좁아 글자가 너무 작아지는데, 세로로는 자리가 남는다.
// 그래서 글자가 읽을 수 있는 최소 크기보다 작아지면, 칸이 허락하는 만큼 키운다.
// 이미 충분히 큰 칸(폴드 안쪽 화면, 태블릿 등)은 기본값 그대로 둔다.

/** 한 줄에 들어갈 한글 글자 수의 기본값. */
export const CHARS_PER_LINE = 6;
/** 읽을 수 있는 최소 글자 크기(px). 칸이 허락하는 한 이 크기까지 키운다. */
export const MIN_READABLE_PX = 8;
/** 키우더라도 한 줄에는 이만큼의 글자는 들어가야 한다. */
export const MIN_CHARS_PER_LINE = 4;
/** 키우더라도 세로로 이만큼의 줄(분야 1줄 + 주제 3줄)은 들어가야 한다. */
export const MIN_LINES_PER_CELL = 4;
/** 글자 줄 높이 배수(CSS line-height). */
export const LINE_HEIGHT = 1.2;
/** 칸 안에서 분야·주제 말고 차지하는 세로 자리(px): 날짜 숫자 줄과 다음 단계 표시. */
export const RESERVED_HEIGHT_PX = 40;
/** 글자 크기의 위쪽 한도(px). */
export const MAX_FONT_PX = 24;

/**
 * 칸 안쪽 크기(px)에 맞는 글자 크기(px)를 돌려준다.
 *
 * @param innerWidth 칸의 안쪽 폭(패딩·테두리 제외).
 * @param innerHeight 칸의 안쪽 높이(패딩·테두리 제외).
 */
export function fitCellFont(innerWidth: number, innerHeight: number): number {
  if (innerWidth <= 0 || innerHeight <= 0) return MIN_READABLE_PX;
  const base = innerWidth / CHARS_PER_LINE;
  // 키우더라도 넘지 않는 한도: 한 줄 4글자, 세로 4줄(날짜 숫자 줄과 다음 단계 표시 자리는 뺀다).
  const textHeight = Math.max(0, innerHeight - RESERVED_HEIGHT_PX);
  const ceiling = Math.min(
    innerWidth / MIN_CHARS_PER_LINE,
    textHeight / (MIN_LINES_PER_CELL * LINE_HEIGHT),
  );
  const lifted = Math.max(base, Math.min(MIN_READABLE_PX, ceiling));
  return Math.min(lifted, MAX_FONT_PX);
}
