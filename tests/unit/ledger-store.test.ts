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
