<script lang="ts">
  // 인터넷이 끊겼을 때 앱 전체를 덮는 안내 창. 이어지면 부르는 쪽이 이 창을 닫는다.
  import { connection } from "../core/connection.svelte";

  let button = $state<HTMLButtonElement>();

  // 아래 화면은 inert 라서 키보드 포커스가 갈 곳이 이 창뿐이다.
  $effect(() => button?.focus());
</script>

<div class="offline" role="alertdialog" aria-modal="true" aria-labelledby="offline-title">
  <div class="box">
    <span class="spinner" aria-hidden="true"></span>
    <h2 id="offline-title">인터넷에 연결되지 않았다</h2>
    <p>연결되면 자동으로 이어진다.</p>
    <button type="button" bind:this={button} onclick={() => connection.check()}>다시 확인</button>
  </div>
</div>

<style>
  .offline {
    position: fixed;
    inset: 0;
    z-index: 300;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    background: var(--bg);
  }
  .box { display: flex; flex-direction: column; align-items: center; gap: 10px; text-align: center; }
  h2 { margin: 0; font-size: 1.05rem; }
  p { margin: 0; font-size: 0.9rem; color: var(--muted); }
  .spinner {
    width: 28px;
    height: 28px;
    border: 3px solid var(--line-strong);
    border-top-color: var(--accent);
    border-radius: 50%;
    animation: spin 0.9s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
  @media (prefers-reduced-motion: reduce) {
    .spinner { animation: none; }
  }
</style>
