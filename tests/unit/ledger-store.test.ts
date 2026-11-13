import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchMockSms } from "../../src/features/ledger/mock-sms";
import { ledger } from "../../src/features/ledger/store.svelte";

const NOV = { year: 2026, month: 11 };
const FIELDS = { spent_on: "2026-11-13", method: "현금", category: "식비", amount: 5000, memo: "점심" } as const;

beforeEach(async () => {
  await ledger.stop();
  await ledger.start();
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

  it("그 분류로 적은 항목 수를 센다", async () => {
    await ledger.addEntry({ ...FIELDS, category: "식비" });
    await ledger.addEntry({ ...FIELDS, category: "식비" });
    await ledger.addEntry({ ...FIELDS, category: "교통" });
    expect(ledger.categoryUsage("식비")).toBe(2);
    expect(ledger.categoryUsage("의료")).toBe(0);
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
    ledger.dismiss(first.unparsed.map((u) => u.key));
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
