// 로그아웃 요청 창구. 어느 기능 화면이든 여기로 요청하면 앱 껍데기(App.svelte)가 처리한다.

let handler: (() => void) | null = null;

export const session = {
  /** App.svelte 가 로그아웃 처리 함수를 등록한다. */
  onLogout(fn: () => void): void {
    handler = fn;
  },
  logout(): void {
    handler?.();
  },
};
