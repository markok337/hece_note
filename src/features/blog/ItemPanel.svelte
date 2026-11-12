<script lang="ts">
  import { blog } from "./store.svelte";
  import {
    ASSIGNEES,
    CATEGORIES,
    CHECKS,
    CHECK_LABELS,
    assigneeClearBlock,
    checkToggleBlock,
    topicClearBlock,
    type Assignee,
    type Category,
    type CheckKey,
  } from "./domain";
  import { parseYmd, weekday } from "../../core/dates";
  import { notice } from "../../core/notice.svelte";

  interface Props {
    day: string;
  }

  const { day }: Props = $props();

  const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

  const item = $derived(blog.view(day));
  const title = $derived.by(() => {
    const { month, day: d } = parseYmd(day);
    return `${month}월 ${d}일 (${WEEKDAYS[weekday(day)]})`;
  });

  // 주제는 입력 중에는 내 화면에만 두고, 입력을 마칠 때 저장한다.
  let topicDraft = $state("");
  let moveTarget = $state("");

  // 다른 기기에서 주제가 바뀌었으면 입력 중이 아닐 때 따라간다.
  $effect(() => {
    const saved = item.topic ?? "";
    if (document.activeElement?.id !== "topic-input") topicDraft = saved;
  });

  function setCategory(event: Event): void {
    void blog.patch(day, { category: (event.currentTarget as HTMLSelectElement).value as Category });
  }

  function pickAssignee(who: Assignee): void {
    if (item.assignee === who) {
      const reason = assigneeClearBlock(item);
      if (reason) return notice.say("err", reason);
      void blog.patch(day, { assignee: null });
      return;
    }
    void blog.patch(day, { assignee: who });
  }

  function commitTopic(): void {
    const next = topicDraft.trim() === "" ? null : topicDraft.trim();
    if (next === item.topic) return;
    if (next === null) {
      const reason = topicClearBlock(item);
      if (reason) {
        topicDraft = item.topic ?? "";
        return notice.say("err", reason);
      }
    }
    void blog.patch(day, { topic: next }).then((ok) => {
      if (!ok) topicDraft = item.topic ?? "";
    });
  }

  function toggle(key: CheckKey): void {
    const reason = checkToggleBlock(item, key);
    if (reason) return notice.say("err", reason);
    void blog.patch(day, { [key]: !item[key] });
  }

  async function moveTo(): Promise<void> {
    if (!moveTarget) return;
    if (await blog.move(day, moveTarget)) notice.say("ok", `${moveTarget}(으)로 옮겼다.`);
  }
</script>

<section class="panel">
  <h2>{title}</h2>

  <div class="cols">
    <div class="col">
      <label class="field">
        <span class="label">분야</span>
        <select value={item.category} onchange={setCategory}>
          {#each CATEGORIES as category (category)}
            <option value={category}>{category}</option>
          {/each}
        </select>
      </label>

      <div class="field">
        <span class="label">담당</span>
        <div class="seg">
          {#each ASSIGNEES as who (who)}
            <button
              type="button"
              class="sub"
              class:on={item.assignee === who}
              class:blue={who === "행이"}
              class:pink={who === "챙이"}
              aria-pressed={item.assignee === who}
              onclick={() => pickAssignee(who)}
            >
              {who}
            </button>
          {/each}
        </div>
      </div>

      <label class="field">
        <span class="label">주제</span>
        <input
          id="topic-input"
          maxlength="80"
          placeholder={item.assignee ? "주제를 적는다" : "담당을 먼저 고른다"}
          disabled={!item.assignee}
          bind:value={topicDraft}
          onblur={commitTopic}
          onkeydown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
        />
      </label>
    </div>

    <div class="col">
      <div class="checks">
        {#each CHECKS as key (key)}
          {@const locked = checkToggleBlock(item, key)}
          <button
            type="button"
            class="check"
            class:on={item[key]}
            class:locked={locked !== null}
            aria-pressed={item[key]}
            title={locked ?? ""}
            onclick={() => toggle(key)}
          >
            <span class="box">{item[key] ? "✓" : ""}</span>
            {CHECK_LABELS[key]}
          </button>
        {/each}
      </div>

      <div class="field move">
        <span class="label">다른 날짜로 이동</span>
        <div class="row">
          <input type="date" bind:value={moveTarget} />
          <button type="button" class="sub" disabled={!moveTarget} onclick={moveTo}>옮기기</button>
        </div>
      </div>
    </div>
  </div>
</section>

<style>
  .panel { display: flex; flex-direction: column; gap: 8px; }
  .cols, .col { display: flex; flex-direction: column; gap: 8px; }

  h2 { margin: 0; font-size: 1.05rem; }
  .field { display: flex; flex-direction: column; gap: 4px; }
  .label { color: var(--muted); font-size: 0.8rem; }
  select {
    padding: 9px 10px;
    font-size: 1rem;
    background: var(--bg);
    color: var(--text);
    border: 1px solid var(--line);
    border-radius: 8px;
  }
  .seg { display: flex; gap: 8px; }
  .seg button { padding: 9px 12px; }
  .seg button { flex: 1; }
  .seg button.on.blue { background: var(--cell-blue); color: var(--cell-dark-text); border-color: transparent; font-weight: 700; }
  .seg button.on.pink { background: var(--cell-pink); color: var(--cell-dark-text); border-color: transparent; font-weight: 700; }

  .checks { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
  .check {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 9px 10px;
    font-size: 0.95rem;
    text-align: left;
    font-weight: 400;
    color: var(--text);
    background: var(--bg);
    border: 1px solid var(--line);
  }
  .check.on { border-color: var(--accent); }
  /* 아직 못 누르는 항목: 흐리게(투명도) 만들면 읽기 어려우니 점선과 보조 글자색으로 구분한다. */
  .check.locked:not(.on) { color: var(--muted); background: var(--panel); border-style: dashed; }
  .box {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    border: 2px solid var(--muted);
    border-radius: 5px;
    font-size: 0.9rem;
    line-height: 1;
  }
  .check.on .box { background: var(--accent); border-color: var(--accent); color: var(--accent-text); }

  .move { padding-top: 8px; border-top: 1px solid var(--line); }
  .row input { padding: 9px 10px; }
  .row button { padding: 9px 14px; }
  .panel :global(input) { padding: 9px 10px; }
  .row { display: flex; gap: 8px; }

  /* 낮은 화면(폰을 가로로 눕힌 경우 등)에서는 두 열로 나눠 세로 길이를 줄인다.
     위의 일반 규칙을 덮어써야 하니 반드시 스타일의 맨 뒤에 둔다. */
  @media (max-height: 520px) {
    .cols { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; align-items: start; }
    .panel { gap: 4px; }
    .col { gap: 5px; }
    h2 { font-size: 1rem; }
    /* 세로가 아주 모자라니 항목 안쪽 여백을 더 줄인다. */
    .check { padding: 6px 8px; font-size: 0.9rem; }
    select, .seg button, .panel :global(input), .row button { padding-top: 6px; padding-bottom: 6px; }
    .move { padding-top: 6px; }
  }
</style>
