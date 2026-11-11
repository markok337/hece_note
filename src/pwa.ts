import { registerSW } from "virtual:pwa-register";

const CHECK_INTERVAL_MS = 60 * 60 * 1000;

/** 서비스 워커를 등록하고, 앞으로 나올 때마다 새 버전이 있는지 확인한다.
 *
 * 폰은 앱을 닫아도 프로세스가 남아 있어서 "켤 때만" 확인하면 업데이트를 놓친다.
 * 그래서 화면이 다시 보일 때와 1시간마다 확인한다. 새 버전을 받으면 autoUpdate 설정이
 * 화면을 알아서 새로 불러온다.
 */
export function setupAutoUpdate(): void {
  registerSW({
    immediate: true,
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return;
      const check = () => {
        if (navigator.onLine) void registration.update();
      };
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") check();
      });
      setInterval(check, CHECK_INTERVAL_MS);
    },
  });
}
