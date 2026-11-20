import { describe, expect, it } from "vitest";
import { bookOnDay, conflictingBook, validateBook, weekBookSegments, type ReadingBook } from "./domain";

const book: ReadingBook = {
  id: "1", reader: "행이", title: "책", author: "글쓴이",
  start_day: "2026-11-10", end_day: null, created_at: "2026-11-10T00:00:00Z",
};

describe("독서 기간", () => {
  it("같은 사람의 기간이 하루라도 겹치면 막고 다른 사람이나 맞닿지 않는 기간은 허용한다", () => {
    const finished = { ...book, end_day: "2026-11-12" };
    expect(conflictingBook({ ...book, id: "2", start_day: "2026-11-12" }, [finished])).toEqual(finished);
    expect(conflictingBook({ ...book, id: "2", start_day: "2026-11-13" }, [finished])).toBeUndefined();
    expect(conflictingBook({ ...book, id: "2", reader: "챙이" }, [finished])).toBeUndefined();
    expect(conflictingBook(finished, [finished])).toBeUndefined();
  });
  it("종료일이 없으면 오늘까지만 표시한다", () => {
    expect(bookOnDay(book, "2026-11-09", "2026-11-19")).toBe(false);
    expect(bookOnDay(book, "2026-11-10", "2026-11-19")).toBe(true);
    expect(bookOnDay(book, "2026-11-19", "2026-11-19")).toBe(true);
    expect(bookOnDay(book, "2026-11-20", "2026-11-19")).toBe(false);
  });

  it("종료일을 입력하면 시작일과 종료일을 모두 포함한다", () => {
    const finished = { ...book, end_day: "2026-11-12" };
    expect(bookOnDay(finished, "2026-11-12", "2026-11-19")).toBe(true);
    expect(bookOnDay(finished, "2026-11-13", "2026-11-19")).toBe(false);
  });

  it("종료일이 시작일보다 빠르면 막는다", () => {
    expect(validateBook({ ...book, end_day: "2026-11-09" })).toBeTruthy();
    expect(validateBook(book)).toBeNull();
  });

  it("한 주의 책 기간을 이어진 구간으로 만들고 겹치는 책은 다른 줄에 놓는다", () => {
    const week = ["2026-11-08", "2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13", "2026-11-14"];
    const segments = weekBookSegments(week, [book, { ...book, id: "2", reader: "챙이", start_day: "2026-11-11", end_day: "2026-11-13" }], "2026-11-19");
    expect(segments.map(({ start, end, lane }) => ({ start, end, lane }))).toEqual([
      { start: 2, end: 6, lane: 0 },
      { start: 3, end: 5, lane: 1 },
    ]);
  });
});
