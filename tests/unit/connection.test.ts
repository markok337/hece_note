import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Connection } from "../../src/core/connection.svelte";

// 테스트 환경은 브라우저가 아니라서, 연결 확인이 듣는 window·document 를 이벤트만 받는 가짜로 바꾼다.
let win: EventTarget;
let doc: EventTarget & { visibilityState: string };

beforeEach(() => {
  vi.useFakeTimers();
  win = new EventTarget();
  doc = Object.assign(new EventTarget(), { visibilityState: "visible" });
  vi.stubGlobal("window", win);
  vi.stubGlobal("document", doc);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("연결 확인", () => {
  it("서버에 닿으면 온라인이고, 시작 직후에는 안내 창이 뜨지 않는다", async () => {
    const connection = new Connection();
    const stop = connection.start(() => Promise.resolve(true));
    expect(connection.online).toBe(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(connection.online).toBe(true);
    stop();
  });

  it("처음부터 닿지 못하면 오프라인이 된다", async () => {
    const connection = new Connection();
    const stop = connection.start(() => Promise.resolve(false));
    await vi.advanceTimersByTimeAsync(0);
    expect(connection.online).toBe(false);
    stop();
  });

  it("확인이 던져도 오프라인으로 본다", async () => {
    const connection = new Connection();
    const stop = connection.start(() => Promise.reject(new Error("network")));
    await vi.advanceTimersByTimeAsync(0);
    expect(connection.online).toBe(false);
    stop();
  });

  it("offline 알림이 오면 확인을 기다리지 않고 바로 오프라인이 된다", async () => {
    const connection = new Connection();
    const stop = connection.start(() => Promise.resolve(true));
    await vi.advanceTimersByTimeAsync(0);
    win.dispatchEvent(new Event("offline"));
    expect(connection.online).toBe(false);
    stop();
  });

  it("끊긴 동안 3초마다 다시 확인하고, 닿으면 저절로 온라인이 된다", async () => {
    let reachable = false;
    const probe = vi.fn(() => Promise.resolve(reachable));
    const connection = new Connection();
    const stop = connection.start(probe);
    await vi.advanceTimersByTimeAsync(0);
    expect(connection.online).toBe(false);

    reachable = true;
    await vi.advanceTimersByTimeAsync(3_000);
    expect(connection.online).toBe(true);
    stop();
  });

  it("이어진 동안에는 30초마다 확인하고, 그사이 끊기면 오프라인이 된다", async () => {
    let reachable = true;
    const probe = vi.fn(() => Promise.resolve(reachable));
    const connection = new Connection();
    const stop = connection.start(probe);
    await vi.advanceTimersByTimeAsync(0);
    expect(probe).toHaveBeenCalledTimes(1);

    reachable = false;
    await vi.advanceTimersByTimeAsync(29_999);
    expect(connection.online).toBe(true);
    await vi.advanceTimersByTimeAsync(1);
    expect(connection.online).toBe(false);
    stop();
  });

  it("online 알림과 화면이 다시 보일 때 바로 확인한다", async () => {
    const probe = vi.fn(() => Promise.resolve(true));
    const connection = new Connection();
    const stop = connection.start(probe);
    await vi.advanceTimersByTimeAsync(0);

    win.dispatchEvent(new Event("online"));
    await vi.advanceTimersByTimeAsync(0);
    expect(probe).toHaveBeenCalledTimes(2);

    doc.visibilityState = "hidden";
    doc.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(0);
    expect(probe).toHaveBeenCalledTimes(2);

    doc.visibilityState = "visible";
    doc.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(0);
    expect(probe).toHaveBeenCalledTimes(3);
    stop();
  });

  it("확인이 진행 중이면 같은 확인을 기다려서 요청이 겹치지 않는다", async () => {
    const probe = vi.fn(() => new Promise<boolean>((resolve) => setTimeout(() => resolve(true), 100)));
    const connection = new Connection();
    const stop = connection.start(probe);
    void connection.check();
    void connection.check();
    await vi.advanceTimersByTimeAsync(100);
    expect(probe).toHaveBeenCalledTimes(1);
    stop();
  });

  it("멈추면 더 확인하지 않는다", async () => {
    const probe = vi.fn(() => Promise.resolve(true));
    const connection = new Connection();
    const stop = connection.start(probe);
    await vi.advanceTimersByTimeAsync(0);
    stop();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(probe).toHaveBeenCalledTimes(1);
  });
});
