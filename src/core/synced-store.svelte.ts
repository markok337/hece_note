// 서버와 맞춰 쓰는 기능 스토어(블로그·냉장고·가계부)의 공통 뼈대.
//
// 화면은 먼저 바꾸고 서버에는 나중에 보낸다(낙관적 쓰기). 그래서 아래 규칙이 꼭 필요하고, 한 곳에서만 지킨다.
//  - 쓰기는 한 줄로 세워 누른 순서대로 보낸다.
//  - 쓰는 동안 들어온 실시간 알림과 불러오기는 내가 방금 바꾼 화면을 옛 값으로 덮을 수 있어 미루고, 끝나면 한 번만 다시 불러온다.
//  - 응답을 기다리는 사이 쓰기가 시작됐거나 더 늦게 시작한 불러오기가 있으면, 그 응답은 오래된 것이라 버린다.
//  - 로그아웃(stop) 뒤에는 끝난 쓰기가 다시 불러오기를 부르지 않는다.
// 기능마다 다른 것(무엇을 불러오고 어디에 반영하는지, 실시간 구독)은 하위 클래스가 채운다.

import type { RealtimeChannel } from "@supabase/supabase-js";
import { notice } from "./notice.svelte";
import { WriteQueue } from "./write-queue";

export const NOT_LOADED_MESSAGE = "아직 불러오지 못했다. 새로고침 후 다시 시도한다.";

/** 실시간 연결 상태 콜백. 연결되면 true, 끊기면 false. */
export type StatusHandler = (isLive: boolean) => void;

/** `receive` 는 하위 클래스가 실시간 알림을 반영할 때 감싸 부르는 함수다. 쓰는 중이면 알림을 미룬다. */
export type Receive = (apply: () => void) => void;

export abstract class SyncedStore<Snapshot> {
  loaded = $state(false);
  live = $state(false);

  #channel: RealtimeChannel | null = null;
  #writes = new WriteQueue(() => this.#started && void this.load());
  // 불러오기 응답이 오래된 것인지 가려내는 표. 쓰기를 시작할 때마다 epoch 가, 불러오기를 시작할 때마다 loadSeq 가 오른다.
  #epoch = 0;
  #loadSeq = 0;
  // start 와 stop 사이에만 true.
  #started = false;

  /** 서버에서 이 기능의 데이터 전부를 받아 온다. */
  protected abstract fetchSnapshot(): Promise<Snapshot>;
  /** 받아 온 데이터를 상태에 넣는다. */
  protected abstract applySnapshot(snapshot: Snapshot): void;
  /** 로그아웃할 때 메모리의 데이터를 비운다. */
  protected abstract clearData(): void;
  /** 다른 기기의 변경을 받는 구독을 만든다. 알림은 `receive` 로 감싸 반영하고, 연결 상태는 `onStatus` 로 알린다. */
  protected abstract subscribe(receive: Receive, onStatus: StatusHandler): RealtimeChannel;
  protected abstract unsubscribe(channel: RealtimeChannel): Promise<void>;

  async load(): Promise<void> {
    if (this.#writes.busy) {
      // 지금 불러오면 방금 바꾼 화면이 서버의 옛 값으로 덮인다. 쓰기가 끝난 뒤에 불러온다.
      this.#writes.markDirty();
      return;
    }
    const seq = ++this.#loadSeq;
    const epoch = this.#epoch;
    try {
      const snapshot = await this.fetchSnapshot();
      // 더 늦게 시작한 불러오기가 있으면 그쪽 결과가 최신이다(로그아웃도 이렇게 걸러진다).
      if (seq !== this.#loadSeq) return;
      // 응답을 기다리는 사이 쓰기가 시작됐다면 이 값은 내 변경보다 오래됐다. 버리고 쓰기가 끝난 뒤 다시 받는다.
      if (epoch !== this.#epoch) {
        if (this.#writes.busy) this.#writes.markDirty();
        else void this.load();
        return;
      }
      this.applySnapshot(snapshot);
      this.loaded = true;
    } catch (err) {
      notice.say("err", `불러오기 실패: ${(err as Error).message}`);
    }
  }

  async start(): Promise<void> {
    this.#started = true;
    await this.load();
    this.#channel = this.subscribe(
      (apply) => {
        if (this.#writes.busy) this.#writes.markDirty();
        else apply();
      },
      (isLive) => {
        this.live = isLive;
        // 끊겼다 다시 붙으면 그사이 놓친 변경을 다시 가져온다.
        if (isLive) void this.load();
      },
    );
  }

  async stop(): Promise<void> {
    this.#started = false;
    if (this.#channel) await this.unsubscribe(this.#channel);
    this.#channel = null;
    this.live = false;
    this.loaded = false;
    this.#loadSeq += 1; // 로그아웃 뒤에 늦게 도착한 응답이 화면을 채우지 않게 한다.
    this.clearData();
  }

  /**
   * 화면을 먼저 바꾸고 서버에는 누른 순서대로 보낸다. 못 불러온 채 쓰면 서버 내용을 덮을 수 있어 막는다.
   * 실패하면 failure 를 앞에 붙여 알리고, 쓰기가 끝난 뒤 서버 값으로 다시 맞춘다.
   */
  protected write(apply: () => void, task: () => Promise<void>, failure: string): Promise<boolean> {
    if (!this.loaded) {
      notice.say("err", NOT_LOADED_MESSAGE);
      return Promise.resolve(false);
    }
    this.#epoch += 1;
    apply();
    return this.#writes.run(task, (err) => notice.say("err", `${failure}: ${(err as Error).message}`));
  }
}
