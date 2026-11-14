// 문자 본문에서 값을 읽어 양식을 미리 채운다.
// 먼저 사용자가 직접 채워 쌓은 견본의 틀에 맞춰 보고, 맞는 틀이 없으면 이미 아는 모양(한 줄 모양, 카드사 안내 모양)으로 읽는다.
// 읽지 못한 값은 비워 두고, 읽지 못한 문자는 null 이라 양식이 빈칸으로 열린다.

import { localYmd, parseYmd } from "../../core/dates";
import { escapeRegExp, literalPattern, sampleLiterals, type SmsSample } from "./domain";

/** 문자에서 읽어 낸 값. 읽지 못한 값은 undefined 로 비워 둔다. */
export interface Guess {
  spent_on?: string;
  amount?: number;
  merchant?: string;
}

const pad = (value: string): string => value.padStart(2, "0");

/** 문자를 받은 해를 날짜의 연도로 쓴다. 받은 달보다 한참 뒤의 달이면(1월에 온 12월 문자) 지난해로 본다. */
function dateOf(receivedAt: string, month: string, day: string): string {
  // 받은 시각은 UTC 로 저장돼 있어서, 글자를 잘라 쓰면 한국 시각 새벽에 받은 문자가 전날·전해로 계산된다.
  const { year, month: receivedMonth } = parseYmd(localYmd(receivedAt));
  const useYear = Number(month) - receivedMonth > 6 ? year - 1 : year;
  return `${useYear}-${pad(month)}-${pad(day)}`;
}

// ---- 견본의 틀 ----

// 견본 본문에서 값 자리를 잠깐 바꿔 두는 글자(사설 영역이라 문자에 나올 일이 없다).
const AMOUNT_MARK = "";
const DATE_MARK = "";
const MERCHANT_MARK = "";

/** 견본에서 만든 틀: 값 자리만 비워 두고 나머지 글은 그대로, 숫자는 어떤 숫자든, 공백은 어떤 공백이든 맞는다. */
interface Rule {
  regex: RegExp;
  /** 취소 견본이면 -1. 금액은 문자에 부호 없이 적히므로 견본의 부호를 따른다. */
  sign: 1 | -1;
}

/** 글자의 모양만 남긴 식: 숫자는 \d+ 로, 공백은 \s+ 로 느슨하게 한다. */
function looseText(text: string): string {
  return escapeRegExp(text).replace(/\d+/g, "\\d+").replace(/\s+/g, "\\s+");
}

function ruleOf(sample: SmsSample): Rule | null {
  const body = sample.body.trim();
  const literals = sampleLiterals({ body, values: sample.values });
  if (literals.amount === undefined) return null;

  let text = body;
  const marks = [
    ["amount", AMOUNT_MARK],
    ["spent_on", DATE_MARK],
    ["merchant", MERCHANT_MARK],
  ] as const;
  for (const [key, mark] of marks) {
    const literal = literals[key];
    if (literal !== undefined) text = text.replace(literalPattern(key, literal), mark);
  }

  const pattern = text
    .split(/([-])/)
    .map((part) => {
      if (part === AMOUNT_MARK) return "(?<amount>[\\d,]+)";
      if (part === DATE_MARK) return `(?<date>${looseText(literals.spent_on ?? "")})`;
      if (part === MERCHANT_MARK) return "(?<merchant>[^\\n]+?)";
      return looseText(part);
    })
    .join("");
  try {
    return { regex: new RegExp(`^${pattern}$`), sign: (sample.values.amount ?? 0) < 0 ? -1 : 1 };
  } catch {
    return null;
  }
}

/** 문자에서 잡은 날짜 글자("11/12", "2026.11.13", "11월 13일")를 YYYY-MM-DD 로 바꾼다. */
function dateFromText(captured: string, receivedAt: string): string | undefined {
  const [first, second, third] = captured.match(/\d+/g) ?? [];
  if (first === undefined || second === undefined) return undefined;
  if (third === undefined) return dateOf(receivedAt, first, second);
  return `${first.length === 2 ? `20${first}` : first}-${pad(second)}-${pad(third)}`;
}

/** 쌓인 견본의 틀에 맞는 문자면 그 자리의 값을 읽는다. 맞는 틀이 없으면 null. */
function guessFromSamples(text: string, receivedAt: string, samples: readonly SmsSample[]): Guess | null {
  const body = text.trim();
  for (const sample of samples) {
    const rule = ruleOf(sample);
    const found = rule?.regex.exec(body);
    if (!rule || !found?.groups) continue;
    const { amount, date, merchant } = found.groups;
    const guess: Guess = { amount: Number(amount.replace(/,/g, "")) * rule.sign };
    const spentOn = date === undefined ? undefined : dateFromText(date, receivedAt);
    if (spentOn) guess.spent_on = spentOn;
    if (merchant !== undefined) guess.merchant = merchant.trim();
    return guess;
  }
  return null;
}

// ---- 이미 아는 모양 ----

/** 가맹점 줄. 누적금액은 필요 없는 정보라 "누적" 이후는 버리고, 남는 글이 없으면 다음 줄을 본다. */
function merchantFrom(lines: readonly string[]): string | undefined {
  for (const line of lines) {
    const cut = line.indexOf("누적");
    const merchant = (cut === -1 ? line : line.slice(0, cut)).trim();
    if (merchant !== "") return merchant;
  }
  return undefined;
}

/**
 * 아는 모양은 두 가지다. ① "승인|취소 5,600원 가맹점 11/13" 한 줄 모양.
 * ② 카드사 안내 모양: 줄마다 "…승인", "5,000원 일시불", "11/12 17:33", "가맹점" 이 이어진다(우리·NH카드).
 */
function guessKnownShape(text: string, receivedAt: string): Guess | null {
  const oneLine = /(승인|취소) ([\d,]+)원 (.+) (\d{2})\/(\d{2})$/.exec(text);
  if (oneLine) {
    const [, kind, amount, merchant, month, day] = oneLine;
    const value = Number(amount.replace(/,/g, ""));
    return { spent_on: dateOf(receivedAt, month, day), amount: kind === "취소" ? -value : value, merchant };
  }

  // 날짜·시각 줄을 기준으로, 그 앞에서 금액을, 그 뒤에서 가맹점을 읽는다.
  const when = /(\d{1,2})\/(\d{1,2}) \d{1,2}:\d{2}/.exec(text);
  if (!when) return null;
  const amounts = [...text.slice(0, when.index).matchAll(/([\d,]+)원/g)];
  const last = amounts[amounts.length - 1];
  if (!last) return null;
  const value = Number(last[1].replace(/,/g, ""));
  const merchant = merchantFrom(text.slice(when.index + when[0].length).split("\n"));
  return {
    spent_on: dateOf(receivedAt, when[1], when[2]),
    amount: text.includes("취소") ? -value : value,
    ...(merchant ? { merchant } : {}),
  };
}

/** 문자에서 날짜·금액·가맹점을 읽는다. samples 는 이 카드에 쌓인 견본이다. 읽지 못하면 null. */
export function guessFromSms(text: string, receivedAt: string, samples: readonly SmsSample[] = []): Guess | null {
  return guessFromSamples(text, receivedAt, samples) ?? guessKnownShape(text, receivedAt);
}
