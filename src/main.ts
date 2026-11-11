import "./style.css";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { guessDeviceName, loadDeviceName, saveDeviceName } from "./device";
import { setupAutoUpdate } from "./pwa";
import { isConfigMissing, ownerLoginId, supabase } from "./supabase";

const RECENT_LIMIT = 30;
const BUILD_ID = __BUILD_ID__;

interface Ping {
  id: number;
  device_name: string;
  build_id: string;
  created_at: string;
}

const root = document.querySelector<HTMLDivElement>("#app")!;

// 화면 전환 때마다 이전 화면의 전역 리스너를 걷어내기 위한 취소 신호.
let screenAbort = new AbortController();

function shell(body: string): void {
  screenAbort.abort();
  screenAbort = new AbortController();
  root.innerHTML = `
    <main>
      <div class="head"><h1>hece note</h1><span class="ver">빌드 ${BUILD_ID}</span></div>
      ${body}
    </main>`;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString("ko-KR", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

function showConfigMissing(): void {
  shell(
    `<div class="card"><p>Supabase 환경변수가 비어 있다. 빌드할 때 .env(또는 GitHub Secrets) 값이 필요하다. docs/setup.md 참고.</p></div>`,
  );
}

function showLogin(): void {
  shell(`
    <div class="card">
      <p>이 기기에서 처음 여는 경우 개인 키를 한 번 입력한다.</p>
      <form id="login">
        <input id="key" type="password" autocomplete="current-password" placeholder="개인 키" required />
        <button type="submit">입력</button>
      </form>
      <div class="msg" id="msg"></div>
    </div>`);
  const form = root.querySelector<HTMLFormElement>("#login")!;
  const input = root.querySelector<HTMLInputElement>("#key")!;
  const msg = root.querySelector<HTMLDivElement>("#msg")!;
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    msg.className = "msg";
    msg.textContent = "확인 중...";
    const { error } = await supabase!.auth.signInWithPassword({
      email: ownerLoginId,
      password: input.value,
    });
    if (error) {
      msg.className = "msg err";
      msg.textContent = "키가 맞지 않다.";
      return;
    }
    showPings();
  });
}

function showPings(): void {
  let deviceName = loadDeviceName() ?? guessDeviceName();
  let channel: RealtimeChannel | null = null;
  let pings: Ping[] = [];

  shell(`
    <div class="card">
      <p>기기 이름</p>
      <form id="name-form">
        <input id="name" maxlength="40" value="${escapeHtml(deviceName)}" required />
        <button type="submit" class="sub">저장</button>
      </form>
      <div class="row">
        <button id="ping">여기서 접속함</button>
        <button id="refresh" class="sub">새로고침</button>
      </div>
      <div class="msg" id="msg"></div>
    </div>
    <div class="card">
      <div class="head"><p>접속 기록</p><span class="live" id="live">연결 중</span></div>
      <ul id="list"></ul>
    </div>
    <div class="row"><button id="logout" class="sub">이 기기에서 로그아웃</button></div>`);

  const list = root.querySelector<HTMLUListElement>("#list")!;
  const msg = root.querySelector<HTMLDivElement>("#msg")!;
  const live = root.querySelector<HTMLSpanElement>("#live")!;

  const render = () => {
    list.innerHTML = pings.length
      ? pings
          .map(
            (p) => `
          <li>
            <span>${escapeHtml(p.device_name)}<br /><span class="build">빌드 ${escapeHtml(p.build_id)}</span></span>
            <span class="when">${formatTime(p.created_at)}</span>
          </li>`,
          )
          .join("")
      : `<li><span class="when">아직 기록이 없다.</span></li>`;
  };

  const load = async () => {
    const { data, error } = await supabase!
      .from("device_pings")
      .select("id, device_name, build_id, created_at")
      .order("created_at", { ascending: false })
      .limit(RECENT_LIMIT);
    if (error) {
      msg.className = "msg err";
      msg.textContent = `불러오기 실패: ${error.message}`;
      return;
    }
    pings = data as Ping[];
    render();
  };

  channel = supabase!
    .channel("device_pings_feed")
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "device_pings" },
      (payload) => {
        const row = payload.new as Ping;
        if (pings.some((p) => p.id === row.id)) return;
        pings = [row, ...pings].slice(0, RECENT_LIMIT);
        render();
      },
    )
    .subscribe((status) => {
      const isLive = status === "SUBSCRIBED";
      live.textContent = isLive ? "실시간 연결됨" : "실시간 끊김";
      live.className = isLive ? "live on" : "live";
      // 끊겼다 다시 붙으면 그사이 놓친 기록을 다시 가져온다.
      if (isLive) void load();
    });

  root.querySelector<HTMLFormElement>("#name-form")!.addEventListener("submit", (e) => {
    e.preventDefault();
    deviceName = root.querySelector<HTMLInputElement>("#name")!.value.trim() || deviceName;
    saveDeviceName(deviceName);
    msg.className = "msg ok";
    msg.textContent = "기기 이름을 저장했다.";
  });

  root.querySelector<HTMLButtonElement>("#ping")!.addEventListener("click", async () => {
    saveDeviceName(deviceName);
    const { error } = await supabase!
      .from("device_pings")
      .insert({ device_name: deviceName, build_id: BUILD_ID });
    msg.className = error ? "msg err" : "msg ok";
    msg.textContent = error ? `기록 실패: ${error.message}` : "기록했다.";
  });

  root.querySelector<HTMLButtonElement>("#refresh")!.addEventListener("click", () => void load());

  root.querySelector<HTMLButtonElement>("#logout")!.addEventListener("click", async () => {
    if (channel) await supabase!.removeChannel(channel);
    await supabase!.auth.signOut();
    showLogin();
  });

  // 폰에서 앱이 다시 앞으로 나올 때 놓친 기록을 가져오는 안전망.
  document.addEventListener(
    "visibilitychange",
    () => {
      if (document.visibilityState === "visible") void load();
    },
    { signal: screenAbort.signal },
  );
}

async function start(): Promise<void> {
  if (isConfigMissing || !supabase) {
    showConfigMissing();
    return;
  }
  const { data } = await supabase.auth.getSession();
  if (data.session) showPings();
  else showLogin();
}

setupAutoUpdate();
void start();
