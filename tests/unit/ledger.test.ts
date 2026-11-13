import { describe, expect, it } from "vitest";
import {
  CASH,
  dayLabel,
  formatWon,
  groupByDate,
  monthStats,
  parseAmount,
  parseSender,
  splitSamples,
  validateCardName,
  type Card,
  type LedgerEntry,
} from "../../src/features/ledger/domain";

function entry(id: string, spent_on: string, amount: number, extra: Partial<LedgerEntry> = {}): LedgerEntry {
  return {
    id,
    spent_on,
    method: CASH,
    category: "식비",
    amount,
    memo: "",
    sms_key: null,
    created_at: "2026-11-01T00:00:00Z",
    ...extra,
  };
}

function card(name: string, sender: string): Card {
  return { id: name, name, sender, samples: [], created_at: "2026-11-01T00:00:00Z" };
}

describe("parseAmount", () => {
  it("쉼표와 원 글자를 떼고 읽는다", () => {
    expect(parseAmount("12,000원")).toEqual({ ok: true, value: 12000 });
  });

  it("음수는 환불·취소로 받는다", () => {
    expect(parseAmount("-3500")).toEqual({ ok: true, value: -3500 });
  });

  it.each(["", "abc", "0", "1.5", "1,000,000,001"])("%j 는 받지 않는다", (raw) => {
    expect(parseAmount(raw).ok).toBe(false);
  });
});

describe("카드 등록 검사", () => {
  it("발신번호는 하이픈을 떼고 숫자만 남긴다", () => {
    expect(parseSender("1588-8700", [])).toEqual({ ok: true, value: "15888700" });
  });

  it("이미 등록한 번호는 받지 않는다", () => {
    expect(parseSender("15888700", [card("신한", "15888700")]).ok).toBe(false);
  });

  it("숫자가 아니거나 너무 짧은 번호는 받지 않는다", () => {
    expect(parseSender("ab12", []).ok).toBe(false);
    expect(parseSender("12", []).ok).toBe(false);
  });

  it("카드 이름은 비었거나 겹치거나 '현금'이면 받지 않는다", () => {
    expect(validateCardName(" ", [])).not.toBeNull();
    expect(validateCardName("신한", [card("신한", "111")])).not.toBeNull();
    expect(validateCardName(CASH, [])).not.toBeNull();
    expect(validateCardName("국민", [card("신한", "111")])).toBeNull();
  });

  it("견본은 빈 줄로 나눠 문자 하나씩 자른다", () => {
    expect(splitSamples("결제 A\n승인\n\n\n취소 B\n")).toEqual(["결제 A\n승인", "취소 B"]);
    expect(splitSamples("  \n ")).toEqual([]);
  });
});

describe("groupByDate", () => {
  it("최근 날짜가 위, 날짜별 합계를 낸다", () => {
    const groups = groupByDate([entry("a", "2026-11-12", 1000), entry("b", "2026-11-13", 500), entry("c", "2026-11-13", 700)]);
    expect(groups.map((g) => [g.date, g.total])).toEqual([
      ["2026-11-13", 1200],
      ["2026-11-12", 1000],
    ]);
  });

  it("같은 날에는 나중에 넣은 항목이 위다", () => {
    const [group] = groupByDate([
      entry("old", "2026-11-13", 1, { created_at: "2026-11-13T01:00:00Z" }),
      entry("new", "2026-11-13", 1, { created_at: "2026-11-13T02:00:00Z" }),
    ]);
    expect(group.entries.map((e) => e.id)).toEqual(["new", "old"]);
  });
});

describe("monthStats", () => {
  const ref = { year: 2026, month: 11 };

  it("취소는 합계에서 빠지고 비율은 지출만으로 센다", () => {
    const stats = monthStats(
      [
        entry("a", "2026-11-01", 6000, { category: "식비" }),
        entry("b", "2026-11-02", 4000, { category: "교통" }),
        entry("c", "2026-11-03", -6000, { category: "식비" }),
      ],
      ref,
    );
    expect(stats.total).toBe(4000);
    expect(stats.count).toBe(3);
    expect(stats.byCategory).toEqual([
      { label: "교통", total: 4000, share: 1 },
      { label: "식비", total: 0, share: 0 },
    ]);
  });

  it("지난달 항목이 없으면 previousTotal 은 null 이다", () => {
    expect(monthStats([entry("a", "2026-11-01", 1000)], ref).previousTotal).toBeNull();
  });

  it("지난달 합계는 연도가 바뀌어도 맞게 센다", () => {
    const stats = monthStats([entry("a", "2025-12-31", 700), entry("b", "2026-01-02", 300)], { year: 2026, month: 1 });
    expect(stats).toMatchObject({ total: 300, previousTotal: 700 });
  });

  it("다른 달 항목은 세지 않는다", () => {
    expect(monthStats([entry("a", "2026-10-31", 9999)], ref)).toMatchObject({ total: 0, count: 0 });
  });

  it("구분별 합계가 큰 순서다", () => {
    const stats = monthStats(
      [entry("a", "2026-11-01", 100), entry("b", "2026-11-02", 900, { method: "신한" })],
      ref,
    );
    expect(stats.byMethod.map((s) => s.label)).toEqual(["신한", CASH]);
  });
});

describe("표시", () => {
  it("금액에 쉼표와 원을 붙인다", () => {
    expect(formatWon(1234567)).toBe("1,234,567원");
    expect(formatWon(-3500)).toBe("-3,500원");
  });

  it("날짜 제목에 요일을 붙인다", () => {
    expect(dayLabel("2026-11-13")).toBe("11월 13일 (금)");
  });
});
