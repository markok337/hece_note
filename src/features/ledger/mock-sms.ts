// 문자 불러오기의 모의 구현. 화면 흐름을 보려고 등록한 카드마다 가짜 결제 문자를 만들어 낸다.
// 실제 문자 읽기(4단계)가 붙으면 fetchMockSms 자리에 같은 모양(NewSms 목록)을 돌려주는 함수가 들어가고,
// guessFromMock 자리에는 견본에서 만든 규칙(3단계)이 들어간다.

import { dayNumber, fromDayNumber } from "../../core/dates";
import type { Card } from "./domain";
import type { NewSms } from "./store.svelte";

const MOCK_DELAY_MS = 600;

interface Shop {
  merchant: string;
  amount: number;
  daysAgo: number;
}

const SHOPS: readonly Shop[] = [
  { merchant: "스타벅스", amount: 5600, daysAgo: 0 },
  { merchant: "GS25", amount: 3200, daysAgo: 1 },
  { merchant: "카카오T", amount: 8900, daysAgo: 2 },
  { merchant: "쿠팡", amount: 32900, daysAgo: 4 },
];

const mmdd = (ymd: string): string => `${ymd.slice(5, 7)}/${ymd.slice(8, 10)}`;

/** 그 날짜 낮 12시(한국 시간)의 ISO 시각. */
const noon = (ymd: string): string => `${ymd}T12:00:00+09:00`;

function body(card: Card, kind: "승인" | "취소", shop: Shop, ymd: string): string {
  return `[Web발신] ${card.name} ${kind} ${shop.amount.toLocaleString("ko-KR")}원 ${shop.merchant} ${mmdd(ymd)}`;
}

/** 카드마다 승인 네 건, 취소 한 건, 결제와 무관한 안내 한 건. 같은 카드에서는 매번 같은 문자(같은 sms_key)가 나온다. */
export async function fetchMockSms(cards: readonly Card[], today: string): Promise<NewSms[]> {
  await new Promise((resolve) => setTimeout(resolve, MOCK_DELAY_MS));
  const messages: NewSms[] = [];
  for (const card of cards) {
    SHOPS.forEach((shop, index) => {
      const ymd = fromDayNumber(dayNumber(today) - shop.daysAgo);
      messages.push({ sms_key: `mock:${card.id}:${index}`, sender: card.sender, received_at: noon(ymd), body: body(card, "승인", shop, ymd) });
    });
    // 첫 결제를 취소한 문자.
    messages.push({ sms_key: `mock:${card.id}:cancel`, sender: card.sender, received_at: noon(today), body: body(card, "취소", SHOPS[0], today) });
    messages.push({
      sms_key: `mock:${card.id}:notice`,
      sender: card.sender,
      received_at: noon(today),
      body: `[Web발신] ${card.name} 이번 달 결제 예정 금액 안내입니다. 자세한 내용은 앱에서 확인하세요.`,
    });
  }
  return messages;
}

/** 문자에서 읽어 낸 값. 읽지 못한 값은 undefined 로 비워 둔다. */
export interface Guess {
  spent_on?: string;
  amount?: number;
  merchant?: string;
}

/** 모의 문자의 모양만 아는 임시 읽기. 문자를 받은 해(receivedAt)를 날짜의 연도로 쓴다. 읽지 못하면 null. */
export function guessFromMock(text: string, receivedAt: string): Guess | null {
  const found = /(승인|취소) ([\d,]+)원 (.+) (\d{2})\/(\d{2})$/.exec(text);
  if (!found) return null;
  const [, kind, amount, merchant, month, day] = found;
  const value = Number(amount.replace(/,/g, ""));
  return {
    spent_on: `${receivedAt.slice(0, 4)}-${month}-${day}`,
    amount: kind === "취소" ? -value : value,
    merchant,
  };
}
