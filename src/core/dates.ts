// 날짜 문자열("2026-11-08") 계산. 시간대와 서머타임 영향을 피하려고 UTC 자정 기준 일수로 센다.

const MS_PER_DAY = 86_400_000;

export function parseYmd(ymd: string): { year: number; month: number; day: number } {
  const [year, month, day] = ymd.split("-").map(Number);
  return { year, month, day };
}

export function toYmd(year: number, month: number, day: number): string {
  const pad = (n: number, width: number) => String(n).padStart(width, "0");
  return `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`;
}

/** 1970-01-01부터 센 일수. */
export function dayNumber(ymd: string): number {
  const { year, month, day } = parseYmd(ymd);
  return Math.round(Date.UTC(year, month - 1, day) / MS_PER_DAY);
}

export function fromDayNumber(n: number): string {
  const d = new Date(n * MS_PER_DAY);
  return toYmd(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

/** 기기 시간대 기준 오늘. */
export function todayYmd(): string {
  const now = new Date();
  return toYmd(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

/** 시각(ISO 문자열 등)을 기기 시간대의 날짜("2026-01-01")로 바꾼다. UTC 날짜와 하루 어긋날 수 있는 시각에 쓴다. */
export function localYmd(instant: string | number | Date): string {
  const date = new Date(instant);
  return toYmd(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

/** 0=일요일. */
export function weekday(ymd: string): number {
  return new Date(dayNumber(ymd) * MS_PER_DAY).getUTCDay();
}

export interface MonthRef {
  year: number;
  month: number;
}

export function shiftMonth(ref: MonthRef, delta: number): MonthRef {
  const index = ref.year * 12 + (ref.month - 1) + delta;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

/** 해당 월을 덮는 주 단위 날짜 목록(일요일 시작, 4~6주). */
export function monthGrid(ref: MonthRef): string[][] {
  const first = toYmd(ref.year, ref.month, 1);
  const start = dayNumber(first) - weekday(first);
  const next = shiftMonth(ref, 1);
  const lastDay = dayNumber(toYmd(next.year, next.month, 1)) - 1;
  const weekCount = Math.ceil((lastDay - start + 1) / 7);
  return Array.from({ length: weekCount }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => fromDayNumber(start + w * 7 + d)),
  );
}
