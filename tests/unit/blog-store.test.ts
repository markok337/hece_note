import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BlogDay, CategoryRule } from "../../src/features/blog/domain";

const repo = vi.hoisted(() => ({
  fetchDays: vi.fn(),
  fetchRules: vi.fn(),
  upsertDay: vi.fn(),
  moveDay: vi.fn(),
  subscribeDays: vi.fn(),
  unsubscribe: vi.fn(),
}));
vi.mock("../../src/features/blog/repo", () => repo);

import { blog } from "../../src/features/blog/store.svelte";

const RULE: CategoryRule = {
  effective_from: "1970-01-01",
  anchor_day: "2026-11-08",
  cycle: ["레시피,제품", "뷰티", "맛집,여행"],
};

function row(day: string, extra: Partial<BlogDay> = {}): BlogDay {
  return { day, category: "뷰티", assignee: "행이", topic: "기존 주제", photo: true, writing: false, editing: false, related: false, reserved: false, ...extra };
}

/** 나중에 직접 풀어 줄 수 있는 약속. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

beforeEach(async () => {
  vi.resetAllMocks();
  repo.fetchDays.mockResolvedValue([row("2026-11-10")]);
  repo.fetchRules.mockResolvedValue([RULE]);
  repo.upsertDay.mockResolvedValue(undefined);
  repo.moveDay.mockResolvedValue(undefined);
  repo.unsubscribe.mockResolvedValue(undefined);
  await blog.stop();
});

describe("저장 차단", () => {
  it("불러오기 전에는 저장하지 않고 서버도 건드리지 않는다", async () => {
    const ok = await blog.patch("2026-11-10", { photo: false });
    expect(ok).toBe(false);
    expect(repo.upsertDay).not.toHaveBeenCalled();
  });

  it("불러오기에 실패했으면 저장하지 않는다", async () => {
    repo.fetchDays.mockRejectedValue(new Error("offline"));
    await blog.load();
    expect(await blog.patch("2026-11-10", { photo: false })).toBe(false);
    expect(repo.upsertDay).not.toHaveBeenCalled();
  });

  it("분야 규칙이 없으면 처음 건드리는 날짜는 저장하지 않는다", async () => {
    repo.fetchRules.mockResolvedValue([]);
    await blog.load();
    expect(await blog.patch("2026-11-20", { assignee: "챙이" })).toBe(false);
    expect(repo.upsertDay).not.toHaveBeenCalled();
  });

  it("규칙이 없어도 이미 저장된 날짜는 고칠 수 있다", async () => {
    repo.fetchRules.mockResolvedValue([]);
    await blog.load();
    expect(await blog.patch("2026-11-10", { writing: true })).toBe(true);
  });

  it("불러온 뒤에는 기존 내용을 지키며 저장한다", async () => {
    await blog.load();
    await blog.patch("2026-11-10", { writing: true });
    expect(repo.upsertDay).toHaveBeenCalledWith(expect.objectContaining({ topic: "기존 주제", writing: true }));
  });
});

describe("불러오기와 쓰기가 겹칠 때", () => {
  it("응답을 기다리는 사이 저장하면 옛 응답이 화면을 덮지 않는다", async () => {
    await blog.load();
    const slow = deferred<BlogDay[]>();
    repo.fetchDays.mockReturnValueOnce(slow.promise);
    const loading = blog.load();

    const saving = blog.patch("2026-11-10", { writing: true });
    slow.resolve([row("2026-11-10")]); // 쓰기 전의 옛 값
    await loading;
    expect(blog.stored("2026-11-10")?.writing).toBe(true);

    repo.fetchDays.mockResolvedValue([row("2026-11-10", { writing: true })]);
    await saving;
  });

  it("더 늦게 시작한 불러오기가 있으면 먼저 시작한 응답은 버린다", async () => {
    const first = deferred<BlogDay[]>();
    repo.fetchDays.mockReturnValueOnce(first.promise);
    const older = blog.load();
    repo.fetchDays.mockResolvedValueOnce([row("2026-11-12")]);
    await blog.load();
    first.resolve([row("2026-11-10")]);
    await older;
    expect(blog.stored("2026-11-12")).not.toBeNull();
    expect(blog.stored("2026-11-10")).toBeNull();
  });
});
