<script lang="ts">
  // 두 번 눌러야 실행되는 삭제 버튼. 첫 번째 누름은 빨간 확인 글자로 바꾸기만 하고, 3초 안에 다시 눌러야 실행한다.
  // 다른 곳을 누르면 취소된다. 확인 상태에서도 폭이 같아 줄이 흔들리지 않는다.
  interface Props {
    /** 스크린리더에 읽어 줄 대상 이름("신한카드"). */
    name: string;
    label?: string;
    confirmLabel?: string;
    width?: string;
    /** true 면 입력창 옆 큰 버튼과 높이를 맞춘다. */
    tall?: boolean;
    /** true 면 칩 안에 들어가도록 작게 만든다. */
    small?: boolean;
    disabled?: boolean;
    onconfirm: () => void | Promise<void>;
  }

  const { name, label = "✕", confirmLabel = "삭제", width = "42px", tall = false, small = false, disabled = false, onconfirm }: Props = $props();

  /** 첫 번째 누름 뒤 이 시간 안에 한 번 더 눌러야 실행된다. */
  const CONFIRM_MS = 3000;

  let confirming = $state(false);
  let timer: ReturnType<typeof setTimeout> | undefined;

  $effect(() => () => clearTimeout(timer));

  function press(): void {
    clearTimeout(timer);
    if (confirming) {
      confirming = false;
      void onconfirm();
      return;
    }
    confirming = true;
    timer = setTimeout(() => (confirming = false), CONFIRM_MS);
  }
</script>

<button
  type="button"
  class="sub confirm-btn"
  class:confirm={confirming}
  class:tall
  class:small
  style:width
  {disabled}
  aria-label={confirming ? `${name} ${confirmLabel}` : `${name} 삭제`}
  onclick={press}
  onblur={() => (confirming = false)}
>
  {confirming ? confirmLabel : label}
</button>

<style>
  .confirm-btn { flex-shrink: 0; height: 30px; padding: 0; font-size: 0.85rem; line-height: 1; }
  /* 칩 안에서는 테두리 없이 글자만 보이고, 확인 상태에서만 빨간 바탕이 된다. */
  .confirm-btn.small { height: 24px; font-size: 0.72rem; border-color: transparent; background: transparent; border-radius: 12px; }
  .confirm-btn.tall { height: auto; align-self: stretch; font-size: 1rem; }
  .confirm-btn.confirm { color: var(--accent-text); background: var(--danger); border-color: var(--danger); font-weight: 700; }
</style>
