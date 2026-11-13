// 문자 본문에서 값을 읽어 양식을 미리 채운다. 지금은 임시 읽기이고, 실제 카드 문자의 견본이 쌓이면 견본에서 만든 규칙으로 바뀐다.
// 읽지 못한 값은 비워 두고, 읽지 못한 문자는 null 이라 양식이 빈칸으로 열린다.

/** 문자에서 읽어 낸 값. 읽지 못한 값은 undefined 로 비워 둔다. */
export interface Guess {
  spent_on?: string;
  amount?: number;
  merchant?: string;
}

/** "승인|취소 5,600원 가맹점 11/13" 꼴만 아는 임시 읽기. 문자를 받은 해(receivedAt)를 날짜의 연도로 쓴다. 읽지 못하면 null. */
export function guessFromSms(text: string, receivedAt: string): Guess | null {
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
