import { describe, expect, it } from "vitest";
import { MAX_FONT_PX, MIN_READABLE_PX, fitCellFont } from "../../src/domain/cell-font";

describe("fitCellFont", () => {
  it("충분히 큰 칸은 폭의 1/6 그대로다", () => {
    // 폭 60, 높이 115: 60/6 = 10px 로 이미 읽을 만하다.
    expect(fitCellFont(60, 115)).toBeCloseTo(10);
  });

  it("홀쭉한 칸은 폭의 1/6 보다 키워서 최소 크기를 지킨다", () => {
    // 폭 33, 높이 126(폰): 폭/6 = 5.5px 이지만 세로가 넉넉해 8px 까지 키운다.
    const size = fitCellFont(33, 126);
    expect(size).toBeGreaterThan(33 / 6);
    expect(size).toBeCloseTo(MIN_READABLE_PX);
  });

  it("키워도 한 줄 4글자는 들어가야 한다", () => {
    // 폭 28 이면 4글자 한도는 7px 이다. 8px 로 올리지 않고 7px 에서 멈춘다.
    expect(fitCellFont(28, 200)).toBeCloseTo(28 / 4);
  });

  it("세로가 낮은 칸은 키우지 않는다", () => {
    // 높이 30 이면 6줄 한도는 5px 이라 기본값(폭/6)보다 작다. 기본값을 그대로 쓴다.
    expect(fitCellFont(33, 30)).toBeCloseTo(33 / 6);
  });

  it("아주 큰 칸도 위쪽 한도를 넘지 않는다", () => {
    expect(fitCellFont(400, 400)).toBe(MAX_FONT_PX);
  });

  it("크기를 잴 수 없으면 최소 크기를 돌려준다", () => {
    expect(fitCellFont(0, 100)).toBe(MIN_READABLE_PX);
    expect(fitCellFont(100, 0)).toBe(MIN_READABLE_PX);
  });

  it("폭이 같으면 키가 큰 칸의 글자가 작지 않다", () => {
    expect(fitCellFont(33, 140)).toBeGreaterThanOrEqual(fitCellFont(33, 60));
  });
});
