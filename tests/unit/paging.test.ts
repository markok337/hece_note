import { describe, expect, it } from "vitest";
import { fetchAllPages } from "../../src/core/paging";

/** 서버처럼 from~to 구간만 잘라 주는 가짜 표. */
function table(count: number): (from: number, to: number) => Promise<number[]> {
  const all = Array.from({ length: count }, (_, i) => i);
  return async (from, to) => all.slice(from, to + 1);
}

describe("쪽 나눠 받기", () => {
  it("상한보다 많은 행도 빠짐없이 이어서 받는다", async () => {
    const rows = await fetchAllPages(table(2365));
    expect(rows).toHaveLength(2365);
    expect(rows[0]).toBe(0);
    expect(rows[2364]).toBe(2364);
  });

  it("행 수가 쪽 크기의 배수여도 빈 쪽 하나를 더 받고 끝난다", async () => {
    expect(await fetchAllPages(table(2000))).toHaveLength(2000);
  });

  it("상한보다 적거나 비어 있으면 한 번에 끝난다", async () => {
    expect(await fetchAllPages(table(3))).toHaveLength(3);
    expect(await fetchAllPages(table(0))).toEqual([]);
  });

  it("쪽 하나가 실패하면 예외가 그대로 올라간다", async () => {
    await expect(fetchAllPages(async () => Promise.reject(new Error("끊김")))).rejects.toThrow("끊김");
  });
});
