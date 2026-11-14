import { describe, expect, it, vi } from "vitest";
import { WriteQueue } from "../../src/core/write-queue";

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

describe("WriteQueue", () => {
  it("앞 작업이 느려도 누른 순서대로 처리한다", async () => {
    const queue = new WriteQueue(() => {});
    const done: string[] = [];

    const first = queue.run(async () => {
      await sleep(40);
      done.push("주제");
    }, () => {});
    const second = queue.run(async () => {
      await sleep(1);
      done.push("사진");
    }, () => {});
    await Promise.all([first, second]);

    expect(done).toEqual(["주제", "사진"]);
  });

  it("작업이 남아 있는 동안만 바쁘다", async () => {
    const queue = new WriteQueue(() => {});
    expect(queue.busy).toBe(false);

    const pending = queue.run(() => sleep(10), () => {});
    expect(queue.busy).toBe(true);

    await pending;
    expect(queue.busy).toBe(false);
  });

  it("바쁜 동안 놓친 변경이 있으면 모두 끝난 뒤 한 번만 알린다", async () => {
    const onSettled = vi.fn();
    const queue = new WriteQueue(onSettled);

    const a = queue.run(() => sleep(5), () => {});
    const b = queue.run(() => sleep(5), () => {});
    queue.markDirty();
    queue.markDirty();
    await a;
    expect(onSettled).not.toHaveBeenCalled();
    await b;

    expect(onSettled).toHaveBeenCalledTimes(1);
  });

  it("놓친 변경이 없으면 알리지 않는다", async () => {
    const onSettled = vi.fn();
    const queue = new WriteQueue(onSettled);

    await queue.run(() => sleep(1), () => {});

    expect(onSettled).not.toHaveBeenCalled();
  });

  it("작업이 실패하면 오류를 알리고, 뒤 작업은 계속하며, 끝난 뒤 다시 맞추게 한다", async () => {
    const onSettled = vi.fn();
    const onError = vi.fn();
    const queue = new WriteQueue(onSettled);
    const done: string[] = [];

    const failed = queue.run(async () => {
      throw new Error("네트워크 오류");
    }, onError);
    const next = queue.run(async () => {
      done.push("다음 작업");
    }, onError);

    expect(await failed).toBe(false);
    expect(await next).toBe(true);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(done).toEqual(["다음 작업"]);
    expect(onSettled).toHaveBeenCalledTimes(1);
  });
});
