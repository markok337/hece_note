// 인터넷 연결 상태. 끊기면 앱 위에 안내 창을 덮어 아무것도 못 하게 하고, 다시 이어지면 저절로 풀린다.
//
// 브라우저의 online/offline 알림만으로는 "와이파이는 붙었는데 인터넷이 안 되는" 경우를 알 수 없어서,
// 서버에 실제로 닿는지 가볍게 확인(probe)해 판단한다. 끊긴 동안에는 자주, 이어진 동안에는 드물게 확인한다.

/** 서버에 닿으면 true. 닿지 못하면 false 를 돌려주거나 던진다. */
export type Probe = () => Promise<boolean>;

const WATCH_MS = 30_000;
const RETRY_MS = 3_000;
const PROBE_TIMEOUT_MS = 5_000;

/** 주소로 응답을 받을 수 있는지 본다. 내용은 읽지 않으므로 다른 출처여도(no-cors) 된다. */
export function reachable(url: string | undefined): Probe {
  return async () => {
    if (!navigator.onLine) return false;
    if (!url) return true;
    try {
      await fetch(url, { method: "HEAD", mode: "no-cors", cache: "no-store", signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) });
      return true;
    } catch {
      return false;
    }
  };
}

export class Connection {
  /** 처음에는 이어져 있다고 보고 시작해서, 확인이 끝나기 전에 안내 창이 번쩍이지 않게 한다. */
  online = $state(true);

  #probe: Probe = () => Promise.resolve(true);
  #timer: ReturnType<typeof setTimeout> | undefined;
  #running: Promise<void> | null = null;

  /** 지금 서버에 닿는지 확인한다. 확인 중이면 그 확인을 기다린다. */
  check(): Promise<void> {
    this.#running ??= (async () => {
      this.online = await this.#probe().catch(() => false);
    })().finally(() => {
      this.#running = null;
      this.#schedule();
    });
    return this.#running;
  }

  #schedule(): void {
    clearTimeout(this.#timer);
    this.#timer = setTimeout(() => void this.check(), this.online ? WATCH_MS : RETRY_MS);
  }

  /** 확인을 시작한다. 돌려준 함수를 부르면 멈춘다. */
  start(probe: Probe): () => void {
    this.#probe = probe;
    const down = () => {
      this.online = false;
      this.#schedule();
    };
    const recheck = () => void this.check();
    const onVisible = () => {
      if (document.visibilityState === "visible") recheck();
    };
    window.addEventListener("offline", down);
    window.addEventListener("online", recheck);
    document.addEventListener("visibilitychange", onVisible);
    recheck();
    return () => {
      clearTimeout(this.#timer);
      window.removeEventListener("offline", down);
      window.removeEventListener("online", recheck);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }
}

export const connection = new Connection();
