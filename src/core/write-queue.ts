// 서버에 쓰는 작업을 한 줄로 세워 누른 순서대로 처리한다.
//
// 연달아 저장하면 요청이 서로 앞지를 수 있고, 그러면 나중에 누른 값이 옛 값에 덮인다.
// 또 저장 도중에 돌아온 실시간 알림은 내가 방금 바꾼 상태보다 오래된 값일 수 있다.
// 그래서 쓰는 동안은 외부 변경을 받지 않고, 전부 끝나면 한 번만 다시 불러오게 한다.

export class WriteQueue {
  #tail: Promise<unknown> = Promise.resolve();
  #inflight = 0;
  #dirty = false;
  readonly #onSettled: () => void;

  /** onSettled: 쓰는 동안 놓친 일이 있었고, 쓰기가 모두 끝났을 때 한 번 불린다. */
  constructor(onSettled: () => void) {
    this.#onSettled = onSettled;
  }

  /** 지금 쓰는 중이거나 기다리는 작업이 있으면 true. */
  get busy(): boolean {
    return this.#inflight > 0;
  }

  /** 바쁜 동안 받지 못한 외부 변경이 있다고 적어 둔다. 쓰기가 끝나면 onSettled 가 불린다. */
  markDirty(): void {
    this.#dirty = true;
  }

  /** 작업을 줄 끝에 세운다. 실패하면 onError 를 부르고 false 를 돌려준다. 뒤의 작업은 계속 진행한다. */
  async run(task: () => Promise<void>, onError: (err: unknown) => void): Promise<boolean> {
    this.#inflight += 1;
    const result = this.#tail.then(task).then(
      () => true,
      (err: unknown) => {
        this.#dirty = true;
        onError(err);
        return false;
      },
    );
    this.#tail = result;
    const ok = await result;
    this.#inflight -= 1;
    if (this.#inflight === 0 && this.#dirty) {
      this.#dirty = false;
      this.#onSettled();
    }
    return ok;
  }
}
