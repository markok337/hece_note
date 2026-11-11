import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

// GitHub Pages 하위 경로(/hece_note/)에 배포하므로 base를 맞춘다.
const BASE_PATH = "/hece_note/";

// 빌드마다 값이 달라지는 식별자. 화면에 표시해 어느 버전이 떠 있는지 확인한다.
// GitHub 빌드 서버는 UTC라서 시간대를 서울로 고정해 "2026-11-11 23:05" 꼴로 만든다.
const BUILD_ID = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
}).format(new Date());

export default defineConfig({
  base: BASE_PATH,
  define: {
    __BUILD_ID__: JSON.stringify(BUILD_ID),
  },
  plugins: [
    VitePWA({
      // 새 서비스 워커를 받으면 즉시 활성화하고 열린 화면을 새 버전으로 교체한다.
      registerType: "autoUpdate",
      includeAssets: ["icon.svg"],
      manifest: {
        name: "hece note",
        short_name: "hece",
        description: "개인용 노트 앱",
        lang: "ko",
        start_url: BASE_PATH,
        scope: BASE_PATH,
        display: "standalone",
        background_color: "#111827",
        theme_color: "#111827",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
          {
            src: "icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
    }),
  ],
});
