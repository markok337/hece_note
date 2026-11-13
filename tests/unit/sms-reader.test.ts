import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Card } from "../../src/features/ledger/domain";
import { guessFromSms } from "../../src/features/ledger/sms-guess";

const plugin = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => true },
  registerPlugin: () => plugin,
}));

import { canReadSms, readSms, smsKey } from "../../src/features/ledger/sms-reader";

const NOW = new Date("2026-11-13T03:00:00Z");

function card(name: string, sender: string): Card {
  return { id: name, name, sender, samples: [], created_at: "2026-11-01T00:00:00Z" };
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("문자 식별값", () => {
  it("같은 문자는 같은 값이고, 번호·시각·본문 중 하나라도 다르면 다른 값이다", () => {
    const key = smsKey("15888700", 1_700_000_000_000, "승인 5,600원");
    expect(smsKey("15888700", 1_700_000_000_000, "승인 5,600원")).toBe(key);
    expect(smsKey("15888701", 1_700_000_000_000, "승인 5,600원")).not.toBe(key);
    expect(smsKey("15888700", 1_700_000_000_001, "승인 5,600원")).not.toBe(key);
    expect(smsKey("15888700", 1_700_000_000_000, "승인 5,600원!")).not.toBe(key);
  });

  it("본문은 키에 그대로 들어가지 않는다", () => {
    expect(smsKey("15888700", 1, "비밀 내용")).not.toContain("비밀");
  });
});

describe("문자 읽기", () => {
  it("안드로이드 앱에서만 읽을 수 있다", () => {
    expect(canReadSms()).toBe(true);
  });

  it("등록한 번호(중복 없이)와 30일 전 시각을 플러그인에 넘기고, 결과를 문자함 모양으로 바꾼다", async () => {
    plugin.read.mockResolvedValue({
      messages: [{ sender: "15888700", date: Date.parse("2026-11-12T03:00:00Z"), body: "승인 5,600원" }],
    });
    const result = await readSms([card("신한", "15888700"), card("신한2", "15888700"), card("국민", "16449999")], NOW);
    expect(plugin.read).toHaveBeenCalledWith({ senders: ["15888700", "16449999"], since: Date.parse("2026-10-14T03:00:00Z") });
    expect(result).toEqual([
      {
        sms_key: smsKey("15888700", Date.parse("2026-11-12T03:00:00Z"), "승인 5,600원"),
        sender: "15888700",
        received_at: "2026-11-12T03:00:00.000Z",
        body: "승인 5,600원",
      },
    ]);
  });

  it("등록한 카드가 없으면 플러그인을 부르지 않는다", async () => {
    expect(await readSms([], NOW)).toEqual([]);
    expect(plugin.read).not.toHaveBeenCalled();
  });

  it("권한을 거절하면 예외가 그대로 올라간다", async () => {
    plugin.read.mockRejectedValue(new Error("문자 읽기 권한이 허용되지 않았다."));
    await expect(readSms([card("신한", "15888700")], NOW)).rejects.toThrow("권한");
  });
});

describe("임시 값 읽기", () => {
  it("승인·취소 문자에서 날짜·금액·가맹점을 읽는다", () => {
    expect(guessFromSms("[Web발신] 신한 승인 5,600원 스타벅스 11/13", "2026-11-13T03:00:00Z")).toEqual({
      spent_on: "2026-11-13",
      amount: 5600,
      merchant: "스타벅스",
    });
    expect(guessFromSms("[Web발신] 신한 취소 5,600원 스타벅스 11/13", "2026-11-13T03:00:00Z")?.amount).toBe(-5600);
  });

  it("모르는 모양이면 null 이라 양식이 빈칸으로 열린다", () => {
    expect(guessFromSms("[Web발신] 이번 달 결제 예정 금액 안내", "2026-11-13T03:00:00Z")).toBeNull();
  });
});
