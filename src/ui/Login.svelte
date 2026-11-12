<script lang="ts">
  import { ownerLoginId, supabase } from "../supabase";

  interface Props {
    onsuccess: () => void;
  }

  const { onsuccess }: Props = $props();

  let key = $state("");
  let message = $state("");
  let isError = $state(false);

  async function submit(event: Event): Promise<void> {
    event.preventDefault();
    isError = false;
    message = "확인 중...";
    const { error } = await supabase!.auth.signInWithPassword({
      email: ownerLoginId,
      password: key,
    });
    if (error) {
      isError = true;
      message = "키가 맞지 않다.";
      return;
    }
    onsuccess();
  }
</script>

<div class="card login">
  <p>이 기기에서 처음 여는 경우 개인 키를 한 번 입력한다.</p>
  <form onsubmit={submit}>
    <input type="password" autocomplete="current-password" placeholder="개인 키" required bind:value={key} />
    <button type="submit">입력</button>
  </form>
  <div class="msg" class:err={isError}>{message}</div>
</div>

<style>
  .login { max-width: 420px; margin: 20vh auto 0; }
</style>
