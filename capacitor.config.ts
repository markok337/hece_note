import type { CapacitorConfig } from "@capacitor/cli";

// 안드로이드 앱은 화면 코드를 담지 않고 배포 주소를 연다. 화면과 규칙의 업데이트는 배포만으로 끝나고 APK 는 다시 설치하지 않는다.
// APK 가 하는 일은 폰의 문자함을 읽어 앱에 넘기는 것(SmsInbox 플러그인)뿐이다.
const config: CapacitorConfig = {
  appId: "io.github.markok337.hecenote",
  appName: "hece note",
  // server.url 을 쓰므로 이 폴더는 앱에 쓰이지 않지만, cap sync 가 폴더 존재를 요구한다.
  webDir: "dist",
  server: {
    url: "https://markok337.github.io/hece_note/",
    androidScheme: "https",
  },
};

export default config;
