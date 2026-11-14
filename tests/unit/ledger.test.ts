import { describe, expect, it } from "vitest";
import {
  CASH,
  budgetFor,
  budgetStatus,
  categoryTrend,
  dayLabel,
  defaultCategory,
  emptyBudgetRules,
  entriesBy,
  formatShortWon,
  formatWon,
  groupByDate,
  locateValues,
  monthKeyLabel,
  monthStats,
  newSample,
  parseAmount,
  plainBody,
  parseBudget,
  parseSender,
  perfCount,
  SAMPLES_MAX,
  sampleShape,
  smsCutoff,
  validateCardName,
  validateCategoryName,
  type BudgetRules,
  type Card,
  type LedgerEntry,
  moveItem,
  SAVINGS_CATEGORY,
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
    perf: false,
    created_at: "2026-11-01T00:00:00Z",
    ...extra,
  };
}

describe("perfCount", () => {
  const nov = { year: 2026, month: 11 };

  it("그 달에 실적으로 표시한 지출만 센다", () => {
    const entries = [
      entry("a", "2026-11-02", 1000, { perf: true }),
      entry("b", "2026-11-30", 1000, { perf: true }),
      entry("c", "2026-11-05", 1000),
      entry("d", "2026-10-31", 1000, { perf: true }),
      entry("e", "2026-12-01", 1000, { perf: true }),
    ];
    expect(perfCount(entries, nov)).toBe(2);
  });

  it("표시한 지출이 없으면 0이다", () => {
    expect(perfCount([entry("a", "2026-11-02", 1000)], nov)).toBe(0);
    expect(perfCount([], nov)).toBe(0);
  });
});

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

  it("문자함은 지금부터 30일 전까지만 남긴다", () => {
    const now = new Date("2026-11-13T00:00:00Z");
    expect(new Date(smsCutoff(now)).toISOString()).toBe("2026-10-14T00:00:00.000Z");
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

describe("예산", () => {
  function rules(partial: Partial<BudgetRules>): BudgetRules {
    return { ...emptyBudgetRules(), ...partial };
  }

  it("정한 적이 없으면 예산이 없다", () => {
    expect(budgetFor(emptyBudgetRules(), { year: 2026, month: 11 })).toBeNull();
  });

  it("기본값은 정하지 않은 모든 달에 적용된다", () => {
    const r = rules({ base: 1_000_000 });
    expect(budgetFor(r, { year: 2020, month: 1 })).toBe(1_000_000);
    expect(budgetFor(r, { year: 2030, month: 12 })).toBe(1_000_000);
  });

  it("해당 월 이후 규칙은 그 달부터 다음 규칙까지 이어지고 이전 달은 기본값이다", () => {
    const r = rules({ base: 1_000_000, from: { "2026-09": 1_100_000, "2026-11": 1_200_000 } });
    expect(budgetFor(r, { year: 2026, month: 8 })).toBe(1_000_000);
    expect(budgetFor(r, { year: 2026, month: 9 })).toBe(1_100_000);
    expect(budgetFor(r, { year: 2026, month: 10 })).toBe(1_100_000);
    expect(budgetFor(r, { year: 2026, month: 11 })).toBe(1_200_000);
    expect(budgetFor(r, { year: 2027, month: 2 })).toBe(1_200_000);
  });

  it("해당 월만 규칙은 그 달에만 적용되고 앞뒤 달은 그대로다", () => {
    const r = rules({ base: 1_000_000, from: { "2026-09": 1_100_000 }, only: { "2026-11": 700_000 } });
    expect(budgetFor(r, { year: 2026, month: 10 })).toBe(1_100_000);
    expect(budgetFor(r, { year: 2026, month: 11 })).toBe(700_000);
    expect(budgetFor(r, { year: 2026, month: 12 })).toBe(1_100_000);
  });

  it("기본값이 없고 이후 규칙만 있으면 그 이전 달에는 예산이 없다", () => {
    const r = rules({ from: { "2026-09": 1_100_000 } });
    expect(budgetFor(r, { year: 2026, month: 8 })).toBeNull();
    expect(budgetFor(r, { year: 2026, month: 9 })).toBe(1_100_000);
  });

  it("예산 글자는 쉼표와 원을 떼고 읽고, 숫자가 아니거나 0이면 받지 않는다", () => {
    expect(parseBudget("1,200,000원")).toEqual({ ok: true, value: 1_200_000 });
    for (const raw of ["", "abc", "0", "-5", "1.5", "1,000,000,001"]) expect(parseBudget(raw).ok).toBe(false);
  });

  it("차액은 예산에서 지출을 뺀 값이다", () => {
    expect(budgetStatus(300_000, 1_000_000)).toEqual({ budget: 1_000_000, spent: 300_000, remaining: 700_000, over: false, ratio: 0.3 });
  });

  it("예산을 넘으면 초과로 표시하고 비율은 1에서 멈춘다", () => {
    expect(budgetStatus(1_250_000, 1_000_000)).toMatchObject({ remaining: -250_000, over: true, ratio: 1 });
  });

  it("예산과 꼭 같게 쓰면 초과가 아니다", () => {
    expect(budgetStatus(1_000_000, 1_000_000)).toMatchObject({ remaining: 0, over: false, ratio: 1 });
  });

  it("환불이 커서 지출이 음수여도 비율은 0 아래로 내려가지 않는다", () => {
    expect(budgetStatus(-5000, 1_000_000)).toMatchObject({ remaining: 1_005_000, over: false, ratio: 0 });
  });
});

describe("entriesBy", () => {
  const list = [
    entry("a", "2026-11-01", 1, { category: "식비", method: "신한" }),
    entry("b", "2026-11-02", 2, { category: "교통", method: "신한" }),
    entry("c", "2026-11-03", 3, { category: "식비", method: CASH }),
  ];

  it("분류로 거른다", () => {
    expect(entriesBy(list, "category", "식비").map((e) => e.id)).toEqual(["a", "c"]);
  });

  it("구분으로 거른다", () => {
    expect(entriesBy(list, "method", "신한").map((e) => e.id)).toEqual(["a", "b"]);
  });

  it("없는 이름이면 빈 목록이다", () => {
    expect(entriesBy(list, "category", "의료")).toEqual([]);
  });
});

describe("분류", () => {
  it("분류 이름은 비었거나 길거나 겹치면 받지 않는다", () => {
    expect(validateCategoryName(" ", ["식비"])).not.toBeNull();
    expect(validateCategoryName("가".repeat(11), [])).not.toBeNull();
    expect(validateCategoryName("식비", ["식비"])).not.toBeNull();
    expect(validateCategoryName(" 취미 ", ["식비"])).toBeNull();
  });

  it("새 항목의 기본 분류는 기타가 있으면 기타, 없으면 첫 분류다", () => {
    expect(defaultCategory(["식비", "기타"])).toBe("기타");
    expect(defaultCategory(["식비", "교통"])).toBe("식비");
  });
});

describe("categoryTrend", () => {
  const end = { year: 2026, month: 11 };

  it("끝 달까지 12개월을 오래된 달부터 돌려준다", () => {
    const points = categoryTrend([], end, null);
    expect(points).toHaveLength(12);
    expect(points[0].key).toBe("2025-12");
    expect(points.at(-1)!.key).toBe("2026-11");
    expect(points.slice(0, 3).map((p) => p.label)).toEqual(["12월", "1월", "2월"]);
  });

  it("연도가 바뀌어도 달을 맞게 센다", () => {
    const points = categoryTrend([], { year: 2026, month: 2 }, null);
    expect(points[0].key).toBe("2025-03");
    expect(points.at(-1)!.key).toBe("2026-02");
    expect(new Set(points.map((p) => p.key)).size).toBe(12);
  });

  it("고른 분류만 달별로 합치고 전월 대비를 낸다", () => {
    const points = categoryTrend(
      [
        entry("a", "2026-10-05", 4000, { category: "식비" }),
        entry("b", "2026-11-02", 10000, { category: "식비" }),
        entry("c", "2026-11-03", 99999, { category: "교통" }),
      ],
      end,
      "식비",
    );
    const last = points.at(-1)!;
    const prev = points.at(-2)!;
    expect([prev.total, last.total, last.delta]).toEqual([4000, 10000, 6000]);
  });

  it("분류를 안 고르면 전체를 합친다", () => {
    const points = categoryTrend(
      [entry("a", "2026-11-02", 1000, { category: "식비" }), entry("b", "2026-11-03", 2000, { category: "교통" })],
      end,
      null,
    );
    expect(points.at(-1)!.total).toBe(3000);
  });

  it("두 달 모두 기록이 없으면 전월 대비는 null 이다", () => {
    expect(categoryTrend([], end, null).every((p) => p.delta === null)).toBe(true);
  });

  it("그래프 첫 달의 전월 대비도 그래프 밖의 지난달과 비교해 낸다", () => {
    const points = categoryTrend([entry("a", "2025-11-10", 3000), entry("b", "2025-12-10", 5000)], end, null);
    expect(points[0].key).toBe("2025-12");
    expect(points[0].delta).toBe(2000);
  });

  it("취소(음수)는 달 합계에서 뺀다", () => {
    const points = categoryTrend([entry("a", "2026-11-01", 5000), entry("b", "2026-11-02", -2000)], end, null);
    expect(points.at(-1)!.total).toBe(3000);
  });
});

describe("짧은 금액 표기", () => {
  it.each([
    [5600, "5,600"],
    [10000, "1만"],
    [56000, "5.6만"],
    [150000, "15만"],
    [1234000, "123.4만"],
    [100000000, "1억"],
    [-56000, "-5.6만"],
    [0, "0"],
  ])("%d 는 %s", (amount, expected) => {
    expect(formatShortWon(amount)).toBe(expected);
  });

  it("달 식별값을 읽기 좋은 글자로 바꾼다", () => {
    expect(monthKeyLabel("2026-11")).toBe("2026년 11월");
    expect(monthKeyLabel("2026-01")).toBe("2026년 1월");
  });
});

describe("moveItem", () => {
  it("앞으로 옮기면 그 자리에 끼어든다", () => {
    expect(moveItem(["a", "b", "c", "d"], 3, 1)).toEqual(["a", "d", "b", "c"]);
  });

  it("뒤로 옮기면 그 자리에 끼어든다", () => {
    expect(moveItem(["a", "b", "c", "d"], 0, 2)).toEqual(["b", "c", "a", "d"]);
  });

  it("같은 자리나 범위 밖이면 그대로이고 원본은 바뀌지 않는다", () => {
    const list = ["a", "b"];
    expect(moveItem(list, 1, 1)).toEqual(["a", "b"]);
    expect(moveItem(list, 0, 5)).toEqual(["a", "b"]);
    expect(moveItem(list, -1, 0)).toEqual(["a", "b"]);
    expect(list).toEqual(["a", "b"]);
  });
});

describe("예금(합계 제외 분류)", () => {
  const spend = { id: "s", spent_on: "2026-11-05", method: "신한", category: "식비", amount: 10_000, memo: "", sms_key: null, created_at: "2026-11-05T00:00:00Z" };
  const save = { ...spend, id: "v", category: SAVINGS_CATEGORY, amount: 500_000 };
  const lastMonth = { ...spend, id: "p", spent_on: "2026-10-05", amount: 7_000 };
  const lastMonthSave = { ...save, id: "q", spent_on: "2026-10-06" };
  const NOV = { year: 2026, month: 11 };

  it("월 합계, 건수, 지난달 합계, 분류별·구분별에서 뺀다", () => {
    const stats = monthStats([spend, save, lastMonth, lastMonthSave], NOV);
    expect(stats.total).toBe(10_000);
    expect(stats.count).toBe(1);
    expect(stats.previousTotal).toBe(7_000);
    expect(stats.byCategory.map((slice) => slice.label)).toEqual(["식비"]);
    expect(stats.byMethod).toEqual([{ label: "신한", total: 10_000, share: 1 }]);
  });

  it("결산에 예금 금액을 따로 알려 주고 예금이 없으면 null 이다", () => {
    expect(monthStats([spend, save], NOV).savings).toBe(500_000);
    expect(monthStats([spend], NOV).savings).toBeNull();
    expect(monthStats([save, lastMonthSave], NOV).savings).toBe(500_000);
  });

  it("예금 이력을 볼 때는 하루 합계에 예금을 넣는다", () => {
    expect(groupByDate([save], true)[0].total).toBe(500_000);
  });

  it("예금만 있는 지난달은 지난달 기록이 없는 것과 같다", () => {
    expect(monthStats([spend, lastMonthSave], NOV).previousTotal).toBeNull();
  });

  it("하루 합계에서 뺀다. 항목은 그대로 남는다", () => {
    const [day] = groupByDate([spend, save]);
    expect(day.total).toBe(10_000);
    expect(day.entries).toHaveLength(2);
  });

  it("통계의 전체에서는 빠지고 예금을 직접 고르면 보인다", () => {
    const last = (category: string | null) => categoryTrend([spend, save], NOV, category).at(-1)!.total;
    expect(last(null)).toBe(10_000);
    expect(last(SAVINGS_CATEGORY)).toBe(500_000);
  });
});

describe("문자 견본", () => {
  const BODY = "[Web발신] 신한 승인 5,600원 스타벅스 11/13";
  const FINAL = { spent_on: "2026-11-13", amount: 5600, merchant: "스타벅스" };

  it("문자에 글자 그대로 있는 값만 남긴다", () => {
    expect(locateValues(BODY, FINAL)).toEqual(FINAL);
    // 가맹점을 문자에 없는 이름으로 적으면 규칙이 될 수 없다.
    expect(locateValues(BODY, { ...FINAL, merchant: "커피" })).toEqual({ spent_on: "2026-11-13", amount: 5600 });
  });

  it("금액은 다른 숫자의 일부이면 찾은 것으로 치지 않는다", () => {
    expect(locateValues("승인 15,600원", { amount: 5600 })).toEqual({});
    expect(locateValues("승인 5600원", { amount: 5600 })).toEqual({ amount: 5600 });
  });

  it("취소(음수)도 절댓값으로 찾는다", () => {
    expect(locateValues("취소 5,600원", { amount: -5600 })).toEqual({ amount: -5600 });
  });

  it("날짜는 문자에 적힌 여러 모양으로 찾는다", () => {
    for (const text of ["11/13", "2026.11.13", "26.11.13", "11월 13일", "11-13", "2026-11-13"]) {
      expect(locateValues(`결제 ${text} 완료`, { spent_on: "2026-11-13" })).toEqual({ spent_on: "2026-11-13" });
    }
    expect(locateValues("결제 11/14", { spent_on: "2026-11-13" })).toEqual({});
  });

  it("값만 다른 문자는 같은 모양이다", () => {
    const a = { body: BODY, values: FINAL };
    const b = { body: "[Web발신] 신한 승인 12,000원 GS25 11/14", values: { spent_on: "2026-11-14", amount: 12000, merchant: "GS25" } };
    const cancel = { body: "[Web발신] 신한 취소 5,600원 스타벅스 11/13", values: FINAL };
    expect(sampleShape(a)).toBe(sampleShape(b));
    expect(sampleShape(a)).not.toBe(sampleShape(cancel));
  });

  it("자동 채움이 맞아서 그대로 추가했으면 견본으로 남기지 않는다", () => {
    expect(newSample(BODY, FINAL, FINAL, [])).toBeNull();
  });

  it("자동 채움이 틀렸거나 비었으면 확정한 값으로 견본을 만든다", () => {
    expect(newSample(BODY, FINAL, null, [])).toEqual({ body: BODY, values: FINAL });
    expect(newSample(BODY, FINAL, { ...FINAL, amount: 5000 }, [])).toEqual({ body: BODY, values: FINAL });
    expect(newSample(BODY, FINAL, { spent_on: FINAL.spent_on, amount: 5600 }, [])?.values.merchant).toBe("스타벅스");
  });

  it("문자에 없는 값은 견본에 담지 않고, 금액이 없으면 견본을 만들지 않는다", () => {
    expect(newSample(BODY, { ...FINAL, merchant: "커피" }, null, [])?.values).toEqual({ spent_on: "2026-11-13", amount: 5600 });
    expect(newSample("[Web발신] 안내", { amount: 5600 }, null, [])).toBeNull();
  });

  it("자동 채움이 맞고 메모만 문자에 없는 글로 바꿨으면 견본을 만들지 않는다", () => {
    expect(newSample(BODY, { ...FINAL, merchant: "점심" }, FINAL, [])).toBeNull();
  });

  it("메모를 문자에 있는 글자로 줄여 고치면 견본을 만든다", () => {
    const guess = { ...FINAL, merchant: "스타벅스 강남점" };
    expect(newSample("[Web발신] 신한 승인 5,600원 스타벅스 강남점 11/13", FINAL, guess, [])?.values.merchant).toBe("스타벅스");
  });

  it("이미 같은 모양이 있거나 견본이 가득 차면 만들지 않는다", () => {
    const other = { body: "[Web발신] 신한 승인 12,000원 GS25 11/14", values: { spent_on: "2026-11-14", amount: 12000, merchant: "GS25" } };
    expect(newSample(BODY, FINAL, null, [other])).toBeNull();
    const full = Array.from({ length: SAMPLES_MAX }, (_, i) => ({ body: `다른 ${"가".repeat(i + 1)} 5,000원`, values: { amount: 5000 } }));
    expect(newSample(BODY, FINAL, null, full)).toBeNull();
  });
});

describe("RCS 카드 메시지 풀어 읽기", () => {
  const card = JSON.stringify({
    messageHeader: "[Web발신]",
    card: "open_rich_card",
    layout: {
      widget: "LinearLayout",
      children: [
        { widget: "TextView", text: "승인", textSize: "1dp" },
        { widget: "ImageView", mediaUrl: "https://example.com/a.png" },
        {
          widget: "LinearLayout",
          children: [{ widget: "TextView", text: "● 우리카드 이용안내\n우리(5485)승인\n오*연님\n5,000원 일시불\n11/12 17:33\n이두부야 고덕점\n누적54,150원" }],
        },
      ],
    },
    suggestions: [{ action: { displayText: "내 카드실적/혜택 확인" } }],
  });

  it("화면에 나온 글만 순서대로 이어 일반 문자처럼 만든다", () => {
    expect(plainBody(card)).toBe(
      "[Web발신]\n승인\n● 우리카드 이용안내\n우리(5485)승인\n오*연님\n5,000원 일시불\n11/12 17:33\n이두부야 고덕점\n누적54,150원",
    );
  });

  it("NH카드 모양은 description 의 줄바꿈을 정리해 돌려준다", () => {
    const nh = JSON.stringify({
      message: { generalPurposeCard: { content: { title: "알림", description: "[Web발신]\nNH카드17승인\r\n오*연\r\n2,400원 일시불\r\n11/12 15:43\r\n세븐일레븐 S청구역점" } } },
    });
    expect(plainBody(nh)).toBe("[Web발신]\nNH카드17승인\n오*연\n2,400원 일시불\n11/12 15:43\n세븐일레븐 S청구역점");
  });

  it("일반 문자와 읽을 수 없는 본문은 그대로 돌려준다", () => {
    expect(plainBody("[Web발신] 승인 5,600원")).toBe("[Web발신] 승인 5,600원");
    expect(plainBody("{깨진 JSON")).toBe("{깨진 JSON");
    expect(plainBody('{"layout":{"widget":"LinearLayout"}}')).toBe('{"layout":{"widget":"LinearLayout"}}');
  });

  it("이미 풀어 쓴 글에 다시 써도 바뀌지 않는다", () => {
    expect(plainBody(plainBody(card))).toBe(plainBody(card));
  });
});
