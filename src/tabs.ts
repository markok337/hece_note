// 하단 탭 목록. 기능을 더할 때는 여기에 한 줄을 추가하고, App.svelte 의 탭별 화면 분기에 화면을 연결한다.

export const TABS = [{ id: "blog", label: "블로그" }] as const;

export type TabId = (typeof TABS)[number]["id"];

export const DEFAULT_TAB: TabId = "blog";

const STORAGE_KEY = "hece_tab";

function isTabId(value: string | null): value is TabId {
  return TABS.some((tab) => tab.id === value);
}

/** 마지막으로 보던 탭. 저장소를 못 쓰거나 없어진 탭이면 기본 탭. */
export function loadTab(): TabId {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return isTabId(saved) ? saved : DEFAULT_TAB;
  } catch {
    return DEFAULT_TAB;
  }
}

export function saveTab(tab: TabId): void {
  try {
    localStorage.setItem(STORAGE_KEY, tab);
  } catch {
    // 저장소를 못 쓰는 환경이면 다음 실행에 기본 탭으로 열린다.
  }
}
