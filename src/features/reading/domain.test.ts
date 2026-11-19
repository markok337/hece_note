import { describe, expect, it } from "vitest";
import { bookOnDay, validateBook, type ReadingBook } from "./domain";

const book: ReadingBook = {
  id: "1", reader: "행이", title: "책", author: "글쓴이",
  start_day: "2026-11-10", end_day: null, created_at: "2026-11-10T00:00:00Z",
};

describe("독서 기간", () => {
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
});
