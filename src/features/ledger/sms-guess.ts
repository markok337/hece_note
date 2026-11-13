// 문자 본문에서 값을 읽어 양식을 미리 채운다. 지금은 임시 읽기이고, 실제 카드 문자의 견본이 쌓이면 견본에서 만든 규칙으로 바뀐다.
// 읽지 못한 값은 비워 두고, 읽지 못한 문자는 null 이라 양식이 빈칸으로 열린다.

/** 문자에서 읽어 낸 값. 읽지 못한 값은 undefined 로 비워 둔다. */
export interface Guess {
  spent_on?: string;
  amount?: number;
  merchant?: string;
}

/** 문자를 받은 해를 날짜의 연도로 쓴다. 받은 달보다 한참 뒤의 달이면(1월에 온 12월 문자) 지난해로 본다. */
function dateOf(receivedAt: string, month: string, day: string): string {
  const year = Number(receivedAt.slice(0, 4));
  const receivedMonth = Number(receivedAt.slice(5, 7));
  const useYear = Number(month) - receivedMonth > 6 ? year - 1 : year;
  return `${useYear}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

/**
 * 읽는 모양은 두 가지다. ① "승인|취소 5,600원 가맹점 11/13" 한 줄 모양.
 * ② 카드사 안내 모양: 줄마다 "…승인", "5,000원 일시불", "11/12 17:33", "가맹점" 이 이어진다(우리·NH카드).
 * 읽지 못하면 null.
 */
export function guessFromSms(text: string, receivedAt: string): Guess | null {
  const oneLine = /(승인|취소) ([\d,]+)원 (.+) (\d{2})\/(\d{2})$/.exec(text);
  if (oneLine) {
    const [, kind, amount, merchant, month, day] = oneLine;
    const value = Number(amount.replace(/,/g, ""));
    return { spent_on: dateOf(receivedAt, month, day), amount: kind === "취소" ? -value : value, merchant };
  }

  // 날짜·시각 줄을 기준으로, 그 앞에서 금액을, 그 뒤 첫 줄에서 가맹점을 읽는다.
  const when = /(\d{1,2})\/(\d{1,2}) \d{1,2}:\d{2}/.exec(text);
  if (!when) return null;
  const amounts = [...text.slice(0, when.index).matchAll(/([\d,]+)원/g)];
  const last = amounts[amounts.length - 1];
  if (!last) return null;
  const value = Number(last[1].replace(/,/g, ""));
  const merchant = text
    .slice(when.index + when[0].length)
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line !== "");
  return {
    spent_on: dateOf(receivedAt, when[1], when[2]),
    amount: text.includes("취소") ? -value : value,
    ...(merchant ? { merchant } : {}),
  };
}
