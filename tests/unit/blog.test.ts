import { describe, expect, it } from "vitest";
import {
  applyMove,
  cellColor,
  checkToggleBlock,
  colorLabel,
  defaultCategory,
  emptyDay,
  moveBlock,
  nextStep,
  validate,
  type BlogDay,
  type CategoryRule,
} from "../../src/domain/blog";

const RULE: CategoryRule = {
  effective_from: "1970-01-01",
  anchor_day: "2026-11-08",
  cycle: ["레시피,제품", "뷰티", "맛집,여행"],
};

const day = (patch: Partial<BlogDay> = {}): BlogDay => ({
  ...emptyDay("2026-11-10", "뷰티"),
  ...patch,
});

describe("defaultCategory", () => {
  it("기준일은 첫 분야다", () => {
    expect(defaultCategory("2026-11-08", [RULE])).toBe("레시피,제품");
  });

  it("기준일 다음 날부터 순서대로 돈다", () => {
    expect(defaultCategory("2026-11-09", [RULE])).toBe("뷰티");
    expect(defaultCategory("2026-11-10", [RULE])).toBe("맛집,여행");
    expect(defaultCategory("2026-11-11", [RULE])).toBe("레시피,제품");
  });

  it("기준일 이전도 같은 순서로 거슬러 계산한다", () => {
    expect(defaultCategory("2026-11-07", [RULE])).toBe("맛집,여행");
    expect(defaultCategory("2026-11-06", [RULE])).toBe("뷰티");
  });

  it("월과 해를 넘어도 이어진다", () => {
    // 11/8 → 1/1 은 54일, 54 % 3 = 0 이라 첫 분야로 돌아온다.
    expect(defaultCategory("2027-01-01", [RULE])).toBe("레시피,제품");
    expect(defaultCategory("2027-01-02", [RULE])).toBe("뷰티");
  });

  it("새 규칙은 effective_from 이후에만 적용되고 지난 날짜는 그대로다", () => {
    const next: CategoryRule = {
      effective_from: "2026-12-01",
      anchor_day: "2026-12-01",
      cycle: ["뷰티", "레시피,제품", "맛집,여행"],
    };
    expect(defaultCategory("2026-11-30", [RULE, next])).toBe("뷰티");
    expect(defaultCategory("2026-12-01", [RULE, next])).toBe("뷰티");
    expect(defaultCategory("2026-12-02", [RULE, next])).toBe("레시피,제품");
  });

  it("규칙이 없으면 null이다", () => {
    expect(defaultCategory("2026-11-08", [])).toBeNull();
  });
});

describe("validate", () => {
  it("담당 없이 주제만 있으면 거부한다", () => {
    expect(validate(day({ topic: "김치찌개" }))).not.toBeNull();
  });

  it("주제 없이 사진을 체크하면 거부한다", () => {
    expect(validate(day({ assignee: "행이", photo: true }))).not.toBeNull();
  });

  it("앞 체크 없이 뒤 체크를 하면 거부한다", () => {
    const base = { assignee: "행이" as const, topic: "a", photo: true };
    expect(validate(day({ ...base, editing: true }))).not.toBeNull();
  });

  it("순서대로 채우면 통과한다", () => {
    const full = day({
      assignee: "챙이",
      topic: "a",
      photo: true,
      writing: true,
      editing: true,
      related: true,
      reserved: true,
    });
    expect(validate(full)).toBeNull();
  });
});

describe("checkToggleBlock", () => {
  it("앞 항목이 true여야 체크할 수 있다", () => {
    const item = day({ assignee: "행이", topic: "a" });
    expect(checkToggleBlock(item, "photo")).toBeNull();
    expect(checkToggleBlock(item, "writing")).not.toBeNull();
  });

  it("뒤 항목이 true이면 해제할 수 없다", () => {
    const item = day({ assignee: "행이", topic: "a", photo: true, writing: true });
    expect(checkToggleBlock(item, "photo")).not.toBeNull();
    expect(checkToggleBlock(item, "writing")).toBeNull();
  });
});

describe("cellColor", () => {
  it("분야만 있으면 흰색이다", () => {
    expect(cellColor(day())).toBe("white");
    expect(cellColor(null)).toBe("white");
  });

  it("담당에 따라 행이는 파랑, 챙이는 분홍이다", () => {
    expect(cellColor(day({ assignee: "행이" }))).toBe("blue");
    expect(cellColor(day({ assignee: "챙이" }))).toBe("pink");
  });

  it("주제와 사진 체크는 색을 바꾸지 않는다", () => {
    expect(cellColor(day({ assignee: "챙이", topic: "a", photo: true }))).toBe("pink");
  });

  it("글작성은 분홍, 글보정은 파랑으로 담당과 무관하게 고정된다", () => {
    const base = { assignee: "행이" as const, topic: "a", photo: true };
    expect(cellColor(day({ ...base, writing: true }))).toBe("pink");
    expect(cellColor(day({ ...base, writing: true, editing: true }))).toBe("blue");
  });

  it("연관글은 색을 바꾸지 않는다", () => {
    const base = { assignee: "챙이" as const, topic: "a", photo: true, writing: true };
    expect(cellColor(day({ ...base, editing: true, related: true }))).toBe("blue");
  });

  it("예약이 켜지면 모두 회색이다", () => {
    const all = day({
      assignee: "행이",
      topic: "a",
      photo: true,
      writing: true,
      editing: true,
      related: true,
      reserved: true,
    });
    expect(cellColor(all)).toBe("gray");
  });
});

describe("moveBlock / applyMove", () => {
  const source = day({ day: "2026-11-10", assignee: "행이", topic: "a" });

  it("내용이 없는 날은 옮길 수 없다", () => {
    expect(moveBlock(day(), null)).not.toBeNull();
    expect(moveBlock(null, null)).not.toBeNull();
  });

  it("도착 날짜에 주제가 있으면 막는다", () => {
    const target = day({ day: "2026-11-12", assignee: "챙이", topic: "b" });
    expect(moveBlock(source, target)).not.toBeNull();
  });

  it("도착 날짜가 비었거나 담당까지만 있으면 허용한다", () => {
    expect(moveBlock(source, null)).toBeNull();
    expect(moveBlock(source, day({ day: "2026-11-12", assignee: "챙이" }))).toBeNull();
  });

  it("분야는 따라가고 출발 날짜에는 분야만 남는다", () => {
    const { moved, vacated } = applyMove(source, "2026-11-12");
    expect(moved).toEqual({ ...source, day: "2026-11-12" });
    expect(vacated).toEqual(emptyDay("2026-11-10", "뷰티"));
  });
});

describe("colorLabel", () => {
  it("하늘색은 행이, 분홍은 챙이, 그 외는 비운다", () => {
    expect(colorLabel("blue")).toBe("행이");
    expect(colorLabel("pink")).toBe("챙이");
    expect(colorLabel("white")).toBe("");
    expect(colorLabel("gray")).toBe("");
  });

  it("행이 담당이 글작성 단계(분홍)에 있으면 챙이로 표시된다", () => {
    const item = day({ assignee: "행이", topic: "a", photo: true, writing: true });
    expect(colorLabel(cellColor(item))).toBe("챙이");
  });
});

describe("nextStep", () => {
  it("시작도 안 한 날짜는 표시하지 않는다", () => {
    expect(nextStep(day())).toBeNull();
  });

  it("담당만 있으면 주제가 남았다", () => {
    expect(nextStep(day({ assignee: "행이" }))).toBe("주제");
  });

  it("주제까지 있으면 사진 촬영이 남았다", () => {
    expect(nextStep(day({ assignee: "행이", topic: "a" }))).toBe("사진촬영");
  });

  it("앞 단계를 끝낼수록 다음 단계가 하나씩 넘어간다", () => {
    const base = { assignee: "챙이" as const, topic: "a" };
    expect(nextStep(day({ ...base, photo: true }))).toBe("글작성");
    expect(nextStep(day({ ...base, photo: true, writing: true }))).toBe("글보정");
    expect(nextStep(day({ ...base, photo: true, writing: true, editing: true }))).toBe("연관글");
    expect(
      nextStep(day({ ...base, photo: true, writing: true, editing: true, related: true })),
    ).toBe("예약");
  });

  it("모두 끝났으면 표시하지 않는다", () => {
    const done = day({
      assignee: "행이",
      topic: "a",
      photo: true,
      writing: true,
      editing: true,
      related: true,
      reserved: true,
    });
    expect(nextStep(done)).toBeNull();
  });
});
