import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// 대시보드에서 /rest/v1/ 까지 붙은 주소를 복사해도 동작하도록 프로젝트 루트 주소로 맞춘다.
const url = import.meta.env.VITE_SUPABASE_URL?.trim().replace(/\/(rest\/v1)?\/*$/, "");
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

/** 연결 확인(probe)이 닿아 볼 주소. 환경변수가 비어 있으면 undefined. */
export const supabaseUrl = url;

export const ownerLoginId = import.meta.env.VITE_OWNER_LOGIN_ID;

/** 빌드 때 환경변수가 비어 있으면 true. 화면에서 안내 문구를 띄우는 데 쓴다. */
export const isConfigMissing = !url || !key || !ownerLoginId;

// 세션은 supabase-js가 localStorage에 저장하고 알아서 갱신한다.
export const supabase: SupabaseClient | null = isConfigMissing
  ? null
  : createClient(url, key);
