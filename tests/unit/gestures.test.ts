import { describe, expect, it } from "vitest";
import { swipeDirection } from "../../src/features/blog/gestures";

describe("swipeDirection", () => {
  it("조금만 밀면 달을 넘기지 않는다", () => {
    expect(swipeDirection(-40, 0, 390)).toBeNull();
  });

  it("폭이 좁아도 80px 은 밀어야 한다", () => {
    expect(swipeDirection(-79, 0, 200)).toBeNull();
    expect(swipeDirection(-80, 0, 200)).toBe("next");
  });

  it("넓은 달력은 폭의 1/4 이상 밀어야 한다", () => {
    expect(swipeDirection(-200, 0, 1000)).toBeNull();
    expect(swipeDirection(-250, 0, 1000)).toBe("next");
  });

  it("왼쪽은 다음 달, 오른쪽은 이전 달이다", () => {
    expect(swipeDirection(-300, 0, 390)).toBe("next");
    expect(swipeDirection(300, 0, 390)).toBe("prev");
  });

  it("비스듬히 크게 내려가면 넘기지 않는다", () => {
    expect(swipeDirection(-150, 120, 390)).toBeNull();
    expect(swipeDirection(-150, 90, 390)).toBe("next");
  });
});
