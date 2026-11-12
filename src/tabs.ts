// 앱의 기능 목록 = 하단 탭 목록. 기능을 더할 때는 아래 FEATURES 에 한 항목만 추가한다.
// 화면 연결, 로그인 뒤 시작, 로그아웃 때 정리, 연결 표시는 모두 이 항목에서 나온다.

import type { Component } from "svelte";
import BlogView from "./features/blog/BlogView.svelte";
import { blog } from "./features/blog/store.svelte";
import FridgeView from "./features/fridge/FridgeView.svelte";
import { fridge } from "./features/fridge/store.svelte";

export interface Feature {
  id: string;
  label: string;
  /** 탭 화면. 탭을 오가도 사라지지 않고 숨겨지기만 하므로 화면 상태가 유지된다. */
  view: Component;
  /** 로그인 직후 불린다. 데이터 불러오기와 실시간 구독을 시작한다. */
  start: () => Promise<void>;
  /** 로그아웃 때 불린다. 구독을 끊고 메모리의 데이터를 비운다. */
  stop: () => Promise<void>;
  /** 실시간 연결이 살아 있는지. 하단의 "실시간/끊김" 표시에 쓴다. */
  isLive: () => boolean;
}

export const FEATURES = [
  {
    id: "blog",
    label: "블로그",
    view: BlogView,
    start: () => blog.start(),
    stop: () => blog.stop(),
    isLive: () => blog.live,
  },
  {
    id: "fridge",
    label: "냉장고",
    view: FridgeView,
    start: () => fridge.start(),
    stop: () => fridge.stop(),
    isLive: () => fridge.live,
  },
] as const satisfies readonly Feature[];

export type TabId = (typeof FEATURES)[number]["id"];

export const DEFAULT_TAB: TabId = "blog";

const STORAGE_KEY = "hece_tab";

function isTabId(value: string | null): value is TabId {
  return FEATURES.some((tab) => tab.id === value);
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
