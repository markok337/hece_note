import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import pkg from "./package.json" with { type: "json" };

// GitHub Pages 하위 경로(/hece_note/)에 배포하므로 base를 맞춘다.
const BASE_PATH = "/hece_note/";

// 화면에 표시하는 버전. package.json 의 version 이 원본이다(docs/decisions.md 의 버전 규칙 참고).
const APP_VERSION = pkg.version;

export default defineConfig({
  base: BASE_PATH,
  define: {
    __APP_VERSION__: JSON.stringify(APP_VERSION),
  },
  plugins: [
    svelte(),
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
