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
