import { describe, expect, it } from "vitest";
import { fromDayNumber, dayNumber, monthGrid, shiftMonth, weekday } from "../../src/domain/dates";

describe("dates", () => {
  it("날짜 → 일수 → 날짜로 되돌아온다", () => {
    expect(fromDayNumber(dayNumber("2026-11-08"))).toBe("2026-11-08");
    expect(dayNumber("2026-11-09") - dayNumber("2026-11-08")).toBe(1);
  });

  it("2026-11-08은 일요일이다", () => {
    expect(weekday("2026-11-08")).toBe(0);
  });

  it("월을 넘겨 이동한다", () => {
    expect(shiftMonth({ year: 2026, month: 12 }, 1)).toEqual({ year: 2027, month: 1 });
    expect(shiftMonth({ year: 2026, month: 1 }, -1)).toEqual({ year: 2025, month: 12 });
  });

  it("2026년 11월 달력은 일요일 시작 5주다", () => {
    const grid = monthGrid({ year: 2026, month: 11 });
    expect(grid).toHaveLength(5);
    expect(grid[0][0]).toBe("2026-11-01");
    expect(grid[4][6]).toBe("2026-12-05");
  });

  it("앞 달 날짜가 첫 주를 채운다", () => {
    const grid = monthGrid({ year: 2026, month: 10 });
    expect(grid[0][0]).toBe("2026-09-27");
  });
});
