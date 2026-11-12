// 화면 폭으로 태블릿형(넓음)과 모바일형(좁음)을 나눈다.

const WIDE_QUERY = "(min-width: 720px)";

class Viewport {
  isWide = $state(window.matchMedia(WIDE_QUERY).matches);

  constructor() {
    window
      .matchMedia(WIDE_QUERY)
      .addEventListener("change", (e) => (this.isWide = e.matches));
  }
}

export const viewport = new Viewport();

/** 주소창·시스템 바를 뺀 실제 보이는 높이를 `--app-height`로 둔다.
 *
 * 모바일 브라우저는 `100vh`·`100dvh`가 실제로 보이는 영역보다 클 때가 있어서,
 * 그 값으로 높이를 맞추면 달력 아래쪽이 화면 밖으로 밀려난다.
 */
export function trackAppHeight(): void {
  const apply = () => {
    const height = window.visualViewport?.height ?? window.innerHeight;
    document.documentElement.style.setProperty("--app-height", `${Math.floor(height)}px`);
  };
  apply();
  window.addEventListener("resize", apply);
  window.visualViewport?.addEventListener("resize", apply);
}
