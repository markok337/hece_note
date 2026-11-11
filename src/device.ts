const DEVICE_NAME_KEY = "hece_device_name";

/** UA 문자열로 기기 이름 후보를 추정한다. 사용자가 고칠 수 있는 초기값일 뿐이다. */
export function guessDeviceName(): string {
  const ua = navigator.userAgent;
  if (/Android/.test(ua)) return /Mobile/.test(ua) ? "갤럭시 폰" : "갤럭시 탭";
  if (/Windows/.test(ua)) return "Windows PC";
  return "기기";
}

export function loadDeviceName(): string | null {
  try {
    return localStorage.getItem(DEVICE_NAME_KEY);
  } catch {
    return null;
  }
}

export function saveDeviceName(name: string): void {
  try {
    localStorage.setItem(DEVICE_NAME_KEY, name);
  } catch {
    // 저장소를 못 쓰는 환경이면 다음 실행에 다시 묻는다.
  }
}
