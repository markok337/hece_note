// 문자 불러오기의 모의 구현. 화면 흐름을 보려고 등록한 카드마다 가짜 결제 문자를 만들어 낸다.
// 실제 문자 읽기가 붙으면 이 파일의 fetchMockSms 자리에 같은 모양의 결과를 돌려주는 함수가 들어간다.

import { dayNumber, fromDayNumber } from "../../core/dates";
import type { Card, Category, SmsCandidate, SmsUnparsed } from "./domain";

const MOCK_DELAY_MS = 600;

interface Shop {
  merchant: string;
  category: Category;
  amount: number;
  daysAgo: number;
}

const SHOPS: readonly Shop[] = [
  { merchant: "스타벅스", category: "식비", amount: 5600, daysAgo: 0 },
  { merchant: "GS25", category: "식비", amount: 3200, daysAgo: 1 },
  { merchant: "카카오T", category: "교통", amount: 8900, daysAgo: 2 },
  { merchant: "쿠팡", category: "쇼핑", amount: 32900, daysAgo: 4 },
];

export interface MockSmsResult {
  candidates: SmsCandidate[];
  unparsed: SmsUnparsed[];
}

/** 이미 가져온 문자(knownKeys)를 뺀 새 결제 문자. 카드마다 승인 네 건, 취소 한 건, 읽지 못하는 안내 한 건이다. */
export async function fetchMockSms(cards: readonly Card[], knownKeys: ReadonlySet<string>, today: string): Promise<MockSmsResult> {
  await new Promise((resolve) => setTimeout(resolve, MOCK_DELAY_MS));
  const candidates: SmsCandidate[] = [];
  const unparsed: SmsUnparsed[] = [];

  for (const card of cards) {
    SHOPS.forEach((shop, index) => {
      candidates.push({
        key: `mock:${card.id}:${index}`,
        spent_on: fromDayNumber(dayNumber(today) - shop.daysAgo),
        method: card.name,
        merchant: shop.merchant,
        amount: shop.amount,
        category: shop.category,
      });
    });
    // 첫 결제를 취소한 문자. 취소는 음수 금액으로 들어와 합계에서 빠진다.
    candidates.push({
      key: `mock:${card.id}:cancel`,
      spent_on: today,
      method: card.name,
      merchant: SHOPS[0].merchant,
      amount: -SHOPS[0].amount,
      category: SHOPS[0].category,
    });
    unparsed.push({
      key: `mock:${card.id}:notice`,
      method: card.name,
      raw: `[Web발신] ${card.name} 이번 달 결제 예정 금액 안내입니다. 자세한 내용은 앱에서 확인하세요.`,
    });
  }

  return {
    candidates: candidates.filter((candidate) => !knownKeys.has(candidate.key)),
    unparsed: unparsed.filter((item) => !knownKeys.has(item.key)),
  };
}
