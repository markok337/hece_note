// 앱 전체가 함께 쓰는 알림(토스트). 기능마다 따로 두지 않고 여기 하나로 띄운다.

export interface Notice {
  kind: "ok" | "err";
  text: string;
}

const NOTICE_MS = 4000;

class NoticeBoard {
  current = $state<Notice | null>(null);
  #timer: ReturnType<typeof setTimeout> | undefined;

  say(kind: Notice["kind"], text: string): void {
    this.current = { kind, text };
    clearTimeout(this.#timer);
    this.#timer = setTimeout(() => (this.current = null), NOTICE_MS);
  }
}

export const notice = new NoticeBoard();
