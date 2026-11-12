// "오늘" 날짜. 폰 PWA는 며칠씩 켜져 있을 수 있어서, 날짜가 바뀌면 화면이 따라가야 한다.

import { todayYmd } from "./dates";

const CHECK_INTERVAL_MS = 60_000;

class Clock {
  today = $state(todayYmd());

  refresh(): void {
    const now = todayYmd();
    if (now !== this.today) this.today = now;
  }
}

export const clock = new Clock();

/** 화면이 다시 보일 때와 1분마다 오늘 날짜를 다시 확인한다. */
export function trackToday(): void {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") clock.refresh();
  });
  setInterval(() => clock.refresh(), CHECK_INTERVAL_MS);
}
