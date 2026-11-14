import type { RealtimeChannel } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { notice } from "../../src/core/notice.svelte";
import { SyncedStore, type Receive, type StatusHandler } from "../../src/core/synced-store.svelte";

/** 나중에 직접 풀어 줄 수 있는 약속. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (err: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** 기능과 무관하게 공통 규칙만 시험하려고 만든 가짜 스토어. */
class FakeStore extends SyncedStore<string[]> {
  data: string[] = [];
  fetch = vi.fn<() => Promise<string[]>>();
  receive!: Receive;
  setStatus!: StatusHandler;

  protected fetchSnapshot(): Promise<string[]> {
    return this.fetch();
  }
  protected applySnapshot(snapshot: string[]): void {
    this.data = snapshot;
  }
  protected clearData(): void {
    this.data = [];
  }
  protected subscribe(receive: Receive, onStatus: StatusHandler): RealtimeChannel {
    this.receive = receive;
    this.setStatus = onStatus;
    return {} as RealtimeChannel;
  }
  protected async unsubscribe(): Promise<void> {}

  add(value: string, task: () => Promise<void> = async () => {}): Promise<boolean> {
    return this.write(() => this.data.push(value), task, "추가 실패");
  }
}

let store: FakeStore;

beforeEach(() => {
  notice.current = null;
  store = new FakeStore();
  // 호출할 때마다 새 배열을 줘야 화면 쪽 변경이 가짜 서버의 값을 바꾸지 않는다.
  store.fetch.mockImplementation(async () => ["서버"]);
});

describe("불러오기", () => {
  it("불러오면 데이터가 들어가고 loaded 가 된다", async () => {
    await store.load();
    expect(store.data).toEqual(["서버"]);
    expect(store.loaded).toBe(true);
  });

  it("불러오지 못하면 알리고 loaded 는 그대로다", async () => {
    store.fetch.mockRejectedValue(new Error("끊김"));
    await store.load();
    expect(store.loaded).toBe(false);
    expect(notice.current?.text).toBe("불러오기 실패: 끊김");
  });

  it("더 늦게 시작한 불러오기가 있으면 먼저 시작한 응답은 버린다", async () => {
    const first = deferred<string[]>();
    store.fetch.mockReturnValueOnce(first.promise);
    const older = store.load();
    store.fetch.mockResolvedValueOnce(["새것"]);
    await store.load();
    first.resolve(["옛것"]);
    await older;
    expect(store.data).toEqual(["새것"]);
  });

  it("응답을 기다리는 사이 쓰기가 시작되면 옛 응답이 화면을 덮지 않는다", async () => {
    await store.load();
    const slow = deferred<string[]>();
    store.fetch.mockReturnValueOnce(slow.promise);
    const loading = store.load();
    const saving = store.add("내것");
    slow.resolve(["서버"]); // 쓰기 전의 옛 값
    await loading;
    expect(store.data).toEqual(["서버", "내것"]);
    await saving;
  });

  it("쓰는 중에 부른 불러오기는 미루고, 쓰기가 끝나면 한 번만 다시 불러온다", async () => {
    await store.start();
    const slow = deferred<void>();
    const saving = store.add("내것", () => slow.promise);
    store.fetch.mockClear();
    await store.load();
    expect(store.fetch).not.toHaveBeenCalled();
    slow.resolve();
    await saving;
    expect(store.fetch).toHaveBeenCalledTimes(1);
  });
});

describe("쓰기", () => {
  it("불러오기 전에는 쓰지 않고 서버도 건드리지 않는다", async () => {
    const task = vi.fn();
    const ok = await store.add("내것", task);
    expect(ok).toBe(false);
    expect(task).not.toHaveBeenCalled();
    expect(store.data).toEqual([]);
    expect(notice.current?.kind).toBe("err");
  });

  it("화면에 먼저 반영하고 누른 순서대로 서버에 보낸다", async () => {
    await store.load();
    const order: string[] = [];
    const slow = deferred<void>();
    const a = store.add("a", async () => {
      await slow.promise;
      order.push("a");
    });
    const b = store.add("b", async () => void order.push("b"));
    expect(store.data).toEqual(["서버", "a", "b"]);
    slow.resolve();
    await Promise.all([a, b]);
    expect(order).toEqual(["a", "b"]);
  });

  it("실패하면 이유를 붙여 알리고, 서버 값으로 다시 맞춘다", async () => {
    await store.start();
    store.fetch.mockClear();
    const ok = await store.add("내것", () => Promise.reject(new Error("거절")));
    expect(ok).toBe(false);
    expect(notice.current?.text).toBe("추가 실패: 거절");
    expect(store.fetch).toHaveBeenCalledTimes(1);
    // 다시 불러오기는 쓰기가 끝난 뒤 백그라운드로 돌아서, 서버 값이 들어올 때까지 기다린다.
    await vi.waitFor(() => expect(store.data).toEqual(["서버"]));
  });
});

describe("실시간 알림", () => {
  it("쓰는 중이 아니면 바로 반영한다", async () => {
    await store.start();
    store.receive(() => store.data.push("다른 기기"));
    expect(store.data).toEqual(["서버", "다른 기기"]);
  });

  it("쓰는 중이면 반영하지 않고, 끝난 뒤 다시 불러와 맞춘다", async () => {
    await store.start();
    const slow = deferred<void>();
    const saving = store.add("내것", () => slow.promise);
    const apply = vi.fn();
    store.receive(apply);
    expect(apply).not.toHaveBeenCalled();
    store.fetch.mockClear();
    slow.resolve();
    await saving;
    expect(store.fetch).toHaveBeenCalledTimes(1);
  });

  it("연결 상태를 따라가고, 끊겼다 다시 붙으면 놓친 변경을 다시 불러온다", async () => {
    await store.start();
    store.setStatus(false);
    expect(store.live).toBe(false);
    store.fetch.mockClear();
    store.setStatus(true);
    expect(store.live).toBe(true);
    expect(store.fetch).toHaveBeenCalledTimes(1);
  });
});

describe("정리(로그아웃)", () => {
  it("stop 하면 데이터를 비우고 연결 상태를 내린다", async () => {
    await store.start();
    store.setStatus(true);
    await store.stop();
    expect(store.data).toEqual([]);
    expect(store.loaded).toBe(false);
    expect(store.live).toBe(false);
  });

  it("로그아웃 뒤에 도착한 불러오기 응답은 화면을 채우지 않는다", async () => {
    const slow = deferred<string[]>();
    store.fetch.mockReturnValueOnce(slow.promise);
    const loading = store.start();
    await store.stop();
    slow.resolve(["늦은 응답"]);
    await loading;
    expect(store.data).toEqual([]);
  });

  it("로그아웃 뒤에 실패로 끝난 쓰기는 다시 불러오지 않는다", async () => {
    await store.start();
    const slow = deferred<void>();
    const saving = store.add("내것", () => slow.promise);
    await store.stop();
    store.fetch.mockClear();
    slow.reject(new Error("연결 끊김"));
    await saving;
    expect(store.fetch).not.toHaveBeenCalled();
  });
});
