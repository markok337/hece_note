import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_CATEGORIES, type CategoryRow } from "../../src/features/ledger/domain";

const repo = vi.hoisted(() => ({
  fetchEntries: vi.fn(),
  fetchCards: vi.fn(),
  fetchCategories: vi.fn(),
  fetchBudgetRules: vi.fn(),
  fetchDismissed: vi.fn(),
  upsertEntry: vi.fn(),
  upsertEntries: vi.fn(),
  deleteEntry: vi.fn(),
  upsertCard: vi.fn(),
  deleteCard: vi.fn(),
  upsertCategory: vi.fn(),
  upsertCategories: vi.fn(),
  seedCategories: vi.fn(),
  deleteCategory: vi.fn(),
  upsertBudgetRule: vi.fn(),
  deleteBudgetRule: vi.fn(),
  insertDismissed: vi.fn(),
  subscribeLedger: vi.fn(),
  unsubscribe: vi.fn(),
}));
vi.mock("../../src/features/ledger/repo", () => repo);

import { fetchMockSms } from "../../src/features/ledger/mock-sms";
import { ledger } from "../../src/features/ledger/store.svelte";

const NOV = { year: 2026, month: 11 };
const FIELDS = { spent_on: "2026-11-13", method: "현금", category: "식비", amount: 5000, memo: "점심" } as const;

function defaultRows(): CategoryRow[] {
  return DEFAULT_CATEGORIES.map((name, position) => ({ id: `c${position}`, name, position, created_at: "2026-11-01T00:00:00Z" }));
}

beforeEach(async () => {
  vi.resetAllMocks();
  repo.fetchEntries.mockResolvedValue([]);
  repo.fetchCards.mockResolvedValue([]);
  repo.fetchCategories.mockResolvedValue(defaultRows());
  repo.fetchBudgetRules.mockResolvedValue([]);
  repo.fetchDismissed.mockResolvedValue([]);
  for (const name of [
    "upsertEntry", "upsertEntries", "upsertCategories", "deleteEntry", "upsertCard", "deleteCard", "upsertCategory", "seedCategories",
    "deleteCategory", "upsertBudgetRule", "deleteBudgetRule", "insertDismissed", "unsubscribe",
  ] as const) {
    repo[name].mockResolvedValue(undefined);
  }
  await ledger.stop();
  await ledger.start();
});

describe("저장", () => {
  it("불러오기 전에는 쓰지 않는다", async () => {
    await ledger.stop();
    expect(await ledger.addEntry(FIELDS)).toBe(false);
    expect(repo.upsertEntry).not.toHaveBeenCalled();
  });

  it("항목을 추가·고치기·지우기하면 서버에도 쓴다", async () => {
    await ledger.addEntry(FIELDS);
    const [added] = ledger.entriesIn(NOV);
    expect(repo.upsertEntry).toHaveBeenCalledWith(expect.objectContaining({ id: added.id, amount: 5000 }));
    await ledger.updateEntry(added.id, { amount: 7000 });
    expect(repo.upsertEntry).toHaveBeenLastCalledWith(expect.objectContaining({ id: added.id, amount: 7000 }));
    await ledger.removeEntry(added.id);
    expect(repo.deleteEntry).toHaveBeenCalledWith(added.id);
  });

  it("문자에서 가져온 여러 건은 한 번에 쓴다", async () => {
    await ledger.addEntries([{ ...FIELDS, sms_key: "a" }, { ...FIELDS, sms_key: "b" }]);
    expect(repo.upsertEntries).toHaveBeenCalledTimes(1);
    expect(repo.upsertEntries.mock.calls[0][0]).toHaveLength(2);
    expect(ledger.entriesIn(NOV)).toHaveLength(2);
  });

  it("저장에 실패하면 서버 값으로 되돌린다", async () => {
    repo.upsertEntry.mockRejectedValue(new Error("거부"));
    expect(await ledger.addEntry(FIELDS)).toBe(false);
    await vi.waitFor(() => expect(ledger.entriesIn(NOV)).toEqual([]));
  });

  it("카드, 분류, 예산, 확인한 문자도 서버에 쓴다", async () => {
    await ledger.addCard({ name: "신한", sender: "15888700", samples: [] });
    await ledger.removeCard(ledger.cardList()[0].id);
    await ledger.addCategory("취미");
    await ledger.removeCategory("식비");
    await ledger.setBudget("base", 900_000, NOV);
    await ledger.setBudget("from", 1_000_000, NOV);
    await ledger.removeBudgetRule("from", "2026-11");
    await ledger.dismiss(["x", "y"]);
    expect(repo.upsertCard).toHaveBeenCalledTimes(1);
    expect(repo.deleteCard).toHaveBeenCalledTimes(1);
    expect(repo.upsertCategory).toHaveBeenCalledWith(expect.objectContaining({ name: "취미", position: DEFAULT_CATEGORIES.length }));
    expect(repo.deleteCategory).toHaveBeenCalledWith("c0");
    expect(repo.upsertBudgetRule).toHaveBeenCalledWith(expect.objectContaining({ scope: "from", month: "2026-11-01" }));
    expect(repo.deleteBudgetRule).toHaveBeenCalledTimes(1);
    expect(repo.insertDismissed).toHaveBeenCalledWith(["x", "y"]);
  });

  it("같은 달 예산을 다시 정하면 같은 행을 고쳐 쓴다", async () => {
    await ledger.setBudget("only", 1_000_000, NOV);
    await ledger.setBudget("only", 1_100_000, NOV);
    const [first, second] = repo.upsertBudgetRule.mock.calls.map((call) => call[0]);
    expect(second.id).toBe(first.id);
  });

  it("이미 확인한 문자는 다시 쓰지 않는다", async () => {
    await ledger.dismiss(["x"]);
    await ledger.dismiss(["x"]);
    expect(repo.insertDismissed).toHaveBeenCalledTimes(1);
  });
});

describe("분류 순서", () => {
  it("순서를 바꾸면 선택지 순서가 바뀌고 바뀐 행만 서버에 쓴다", async () => {
    const names = [...ledger.categories];
    await ledger.reorderCategories([names[1], names[0], ...names.slice(2)]);
    expect(ledger.categories.slice(0, 2)).toEqual([names[1], names[0]]);
    expect(ledger.categoryChoices().slice(0, 2)).toEqual([names[1], names[0]]);
    expect(repo.upsertCategories).toHaveBeenCalledTimes(1);
    expect(repo.upsertCategories.mock.calls[0][0].map((row: CategoryRow) => [row.name, row.position])).toEqual([
      [names[1], 0],
      [names[0], 1],
    ]);
  });

  it("순서가 같거나 이름이 맞지 않으면 쓰지 않는다", async () => {
    const names = [...ledger.categories];
    expect(await ledger.reorderCategories(names)).toBe(false);
    expect(await ledger.reorderCategories(names.slice(1))).toBe(false);
    expect(await ledger.reorderCategories([...names.slice(1), "없는분류"])).toBe(false);
    expect(repo.upsertCategories).not.toHaveBeenCalled();
  });
});

describe("불러오기", () => {
  it("서버의 항목, 카드, 예산, 확인한 문자를 가져온다", async () => {
    repo.fetchEntries.mockResolvedValue([{ id: "e1", ...FIELDS, sms_key: null, created_at: "2026-11-13T00:00:00Z" }]);
    repo.fetchCards.mockResolvedValue([{ id: "k1", name: "신한", sender: "15888700", samples: [], created_at: "2026-11-01T00:00:00Z" }]);
    repo.fetchBudgetRules.mockResolvedValue([{ id: "b1", scope: "from", month: "2026-10-01", amount: 800_000 }]);
    repo.fetchDismissed.mockResolvedValue(["d1"]);
    await ledger.load();
    expect(ledger.entriesIn(NOV)).toHaveLength(1);
    expect(ledger.cardList()).toHaveLength(1);
    expect(ledger.budgetFor(NOV)).toBe(800_000);
    expect(ledger.knownSmsKeys().has("d1")).toBe(true);
  });

  it("분류가 하나도 없으면 기본 분류를 채우고 다시 읽는다", async () => {
    repo.fetchCategories.mockResolvedValueOnce([]).mockResolvedValueOnce(defaultRows());
    await ledger.load();
    expect(repo.seedCategories).toHaveBeenCalledTimes(1);
    expect(repo.seedCategories.mock.calls[0][0].map((row: CategoryRow) => row.name)).toEqual([...DEFAULT_CATEGORIES]);
    expect(ledger.categories).toEqual([...DEFAULT_CATEGORIES]);
  });

  it("분류는 position 순서로 나온다", async () => {
    repo.fetchCategories.mockResolvedValue([
      { id: "b", name: "둘째", position: 1, created_at: "2026-11-01T00:00:00Z" },
      { id: "a", name: "첫째", position: 0, created_at: "2026-11-01T00:00:00Z" },
    ]);
    await ledger.load();
    expect(ledger.categories).toEqual(["첫째", "둘째"]);
  });
});

describe("항목", () => {
  it("추가한 항목이 그 달 목록에 나온다", async () => {
    await ledger.addEntry(FIELDS);
    expect(ledger.entriesIn(NOV)).toHaveLength(1);
    expect(ledger.entriesIn({ year: 2026, month: 10 })).toHaveLength(0);
  });

  it("고치면 바뀐 값이 반영되고 문자 식별값은 그대로다", async () => {
    await ledger.addEntry({ ...FIELDS, sms_key: "k1" });
    const [added] = ledger.entriesIn(NOV);
    await ledger.updateEntry(added.id, { amount: 7000 });
    expect(ledger.entriesIn(NOV)[0]).toMatchObject({ amount: 7000, sms_key: "k1" });
  });

  it("없는 항목을 고치거나 지우면 false 다", async () => {
    expect(await ledger.updateEntry("none", { amount: 1 })).toBe(false);
    expect(await ledger.removeEntry("none")).toBe(false);
  });

  it("지우면 목록에서 사라진다", async () => {
    await ledger.addEntry(FIELDS);
    await ledger.removeEntry(ledger.entriesIn(NOV)[0].id);
    expect(ledger.entriesIn(NOV)).toEqual([]);
  });

  it("stop 하면 모두 비운다", async () => {
    await ledger.addEntry(FIELDS);
    await ledger.addCard({ name: "신한", sender: "15888700", samples: [] });
    await ledger.stop();
    expect(ledger.entriesIn(NOV)).toEqual([]);
    expect(ledger.cardList()).toEqual([]);
  });
});

describe("예산", () => {
  const OCT = { year: 2026, month: 10 };
  const DEC = { year: 2026, month: 12 };

  it("기본값을 정하면 모든 달에 적용된다", async () => {
    await ledger.setBudget("base", 900_000, NOV);
    expect(ledger.budgetFor({ year: 2020, month: 1 })).toBe(900_000);
    expect(ledger.budgetFor(DEC)).toBe(900_000);
  });

  it("해당 월 이후는 그 달부터 이어지고 앞선 달은 기본값이다", async () => {
    await ledger.setBudget("base", 900_000, NOV);
    await ledger.setBudget("from", 1_200_000, NOV);
    expect(ledger.budgetFor(OCT)).toBe(900_000);
    expect(ledger.budgetFor(NOV)).toBe(1_200_000);
    expect(ledger.budgetFor(DEC)).toBe(1_200_000);
  });

  it("해당 월만은 그 달에만 적용된다", async () => {
    await ledger.setBudget("base", 900_000, NOV);
    await ledger.setBudget("only", 500_000, NOV);
    expect(ledger.budgetFor(NOV)).toBe(500_000);
    expect(ledger.budgetFor(DEC)).toBe(900_000);
  });

  it("규칙을 지우면 이전 값으로 돌아간다", async () => {
    await ledger.setBudget("base", 900_000, NOV);
    await ledger.setBudget("only", 500_000, NOV);
    expect(await ledger.removeBudgetRule("only", "2026-11")).toBe(true);
    expect(ledger.budgetFor(NOV)).toBe(900_000);
  });

  it("없는 규칙을 지우면 false 다", async () => {
    expect(await ledger.removeBudgetRule("from", "2026-11")).toBe(false);
  });

  it("같은 달에 다시 정하면 값이 바뀐다", async () => {
    await ledger.setBudget("only", 1_000_000, NOV);
    await ledger.setBudget("only", 1_100_000, NOV);
    expect(ledger.budgetFor(NOV)).toBe(1_100_000);
  });

  it("stop 하면 예산도 비운다", async () => {
    await ledger.setBudget("base", 1_000_000, NOV);
    await ledger.stop();
    expect(ledger.budgetFor(NOV)).toBeNull();
  });
});

describe("분류", () => {
  it("처음에는 기본 분류가 있다", () => {
    expect(ledger.categories).toContain("식비");
    expect(ledger.categories).toContain("기타");
  });

  it("분류를 더하면 선택지 끝에 붙고 같은 이름은 더하지 않는다", async () => {
    expect(await ledger.addCategory("취미")).toBe(true);
    expect(ledger.categories.at(-1)).toBe("취미");
    expect(await ledger.addCategory("취미")).toBe(false);
  });

  it("뺀 분류로 적은 이력은 남고 선택지에는 이력이 있는 이름만 따로 붙는다", async () => {
    await ledger.addEntry({ ...FIELDS, category: "의료" });
    await ledger.removeCategory("의료");
    expect(ledger.categories).not.toContain("의료");
    expect(ledger.entriesIn(NOV)[0].category).toBe("의료");
    expect(ledger.categoryChoices("의료")).toContain("의료");
    expect(ledger.categoryChoices()).not.toContain("의료");
  });

  it("마지막 하나는 지울 수 없다", async () => {
    for (const name of [...ledger.categories].slice(1)) await ledger.removeCategory(name);
    expect(ledger.categories).toHaveLength(1);
    expect(await ledger.removeCategory(ledger.categories[0])).toBe(false);
  });

  it("stop 하면 기본 분류로 돌아간다", async () => {
    await ledger.addCategory("취미");
    await ledger.removeCategory("식비");
    await ledger.stop();
    expect(ledger.categories).toContain("식비");
    expect(ledger.categories).not.toContain("취미");
  });
});

describe("문자 불러오기(모의)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  async function load() {
    const pending = fetchMockSms(ledger.cardList(), ledger.knownSmsKeys(), "2026-11-13");
    await vi.runAllTimersAsync();
    return pending;
  }

  it("카드마다 승인·취소·읽지 못한 문자를 돌려준다", async () => {
    await ledger.addCard({ name: "신한", sender: "15888700", samples: [] });
    const result = await load();
    expect(result.candidates.every((c) => c.method === "신한")).toBe(true);
    expect(result.candidates.some((c) => c.amount < 0)).toBe(true);
    expect(result.unparsed).toHaveLength(1);
  });

  it("추가한 문자는 다시 불러오지 않는다", async () => {
    await ledger.addCard({ name: "신한", sender: "15888700", samples: [] });
    const first = await load();
    await ledger.addEntries(
      first.candidates.map((c) => ({
        spent_on: c.spent_on,
        method: c.method,
        category: c.category,
        amount: c.amount,
        memo: c.merchant,
        sms_key: c.key,
      })),
    );
    await ledger.dismiss(first.unparsed.map((u) => u.key));
    expect(await load()).toEqual({ candidates: [], unparsed: [] });
  });

  it("체크를 풀어 추가하지 않은 문자는 다음에 다시 나온다", async () => {
    await ledger.addCard({ name: "신한", sender: "15888700", samples: [] });
    const first = await load();
    const [kept, ...skipped] = first.candidates;
    await ledger.addEntry({ ...FIELDS, sms_key: kept.key });
    const second = await load();
    expect(second.candidates.map((c) => c.key)).toEqual(skipped.map((c) => c.key));
  });

  it("카드가 없으면 만들어 낼 문자도 없다", async () => {
    expect(await load()).toEqual({ candidates: [], unparsed: [] });
  });
});
