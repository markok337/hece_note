<script lang="ts">
  // 예산 설정. 기본값을 바꾸거나, 고른 달만 바꾸거나, 고른 달부터 다음 변경까지 바꾼다.
  // 정한 규칙은 아래 목록에 남고, "해당 월" 규칙은 지울 수 있다.
  import { clock } from "../../core/clock.svelte";
  import { parseYmd } from "../../core/dates";
  import { notice } from "../../core/notice.svelte";
  import ConfirmButton from "../../ui/ConfirmButton.svelte";
  import { formatWon, monthKeyLabel, parseBudget, type BudgetScope } from "../ledger/domain";
  import { ledger } from "../ledger/store.svelte";

  const SCOPES: readonly { id: BudgetScope; label: string; help: string }[] = [
    { id: "base", label: "기본값 변경", help: "따로 정하지 않은 모든 달에 쓰는 기본 예산을 바꾼다. 아래 \"해당 월 이후\" 규칙이 있으면 그 달부터는 그 규칙이 먼저다." },
    { id: "only", label: "해당 월만", help: "고른 달 한 달만 이 금액을 쓴다. 다른 달은 그대로다." },
    { id: "from", label: "해당 월 이후", help: "고른 달부터 다음에 바꿀 때까지 이 금액이 기본값이 된다. 이전 달은 그대로다." },
  ];

  const MONTH_PATTERN = /^(\d{4})-(\d{2})$/;

  const today = $derived(parseYmd(clock.today));
  const current = $derived({ year: today.year, month: today.month });

  let amountText = $state("");
  let scope = $state<BudgetScope>("base");
  let monthText = $state(clock.today.slice(0, 7));

  const scopeHelp = $derived(SCOPES.find((item) => item.id === scope)?.help ?? "");
  const rules = $derived(ledger.budgetRules);
  const sorted = (record: Record<string, number>): [string, number][] =>
    Object.entries(record).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const fromRules = $derived(sorted(rules.from));
  const onlyRules = $derived(sorted(rules.only));
  const nowBudget = $derived(ledger.budgetFor(current));

  async function apply(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    const amount = parseBudget(amountText);
    if (!amount.ok) return notice.say("err", amount.reason);

    let ref = current;
    if (scope !== "base") {
      const match = MONTH_PATTERN.exec(monthText);
      if (!match) return notice.say("err", "적용할 달을 고른다.");
      ref = { year: Number(match[1]), month: Number(match[2]) };
    }
    if (!(await ledger.setBudget(scope, amount.value, ref))) return;

    const label = scope === "base" ? "기본값을" : `${monthKeyLabel(monthText)}${scope === "from" ? " 이후를" : "만"}`;
    notice.say("ok", `${label} ${formatWon(amount.value)}으로 정했다.`);
    amountText = "";
  }
</script>

<div class="sheet">
  <h2 class="band">예산</h2>

  <p class="cell now">
    <span>이번 달({monthKeyLabel(clock.today.slice(0, 7))}) 적용 예산</span>
    <strong>{nowBudget === null ? "정하지 않음" : formatWon(nowBudget)}</strong>
  </p>

  <form class="cell form" onsubmit={apply}>
    <div class="scopes" role="group" aria-label="적용 범위">
      {#each SCOPES as item (item.id)}
        <button type="button" class="scope" class:active={scope === item.id} aria-pressed={scope === item.id} onclick={() => (scope = item.id)}>
          {item.label}
        </button>
      {/each}
    </div>
    <p class="help">{scopeHelp}</p>
    <div class="fields">
      {#if scope !== "base"}
        <input class="month" type="month" bind:value={monthText} aria-label="적용할 달" />
      {/if}
      <input inputmode="numeric" bind:value={amountText} placeholder="예산(원)" aria-label="예산 금액" />
      <button type="submit">적용</button>
    </div>
  </form>

  <h3 class="band">정해 둔 예산</h3>
  <ul>
    <li>
      <span class="what">기본값</span>
      <span class="amount">{rules.base === null ? "정하지 않음" : formatWon(rules.base)}</span>
      <span class="fixed"></span>
    </li>
    {#each fromRules as [key, amount] (key)}
      <li>
        <span class="what">{monthKeyLabel(key)} 이후</span>
        <span class="amount">{formatWon(amount)}</span>
        <ConfirmButton name="{monthKeyLabel(key)} 이후 예산" onconfirm={() => ledger.removeBudgetRule("from", key)} />
      </li>
    {/each}
    {#each onlyRules as [key, amount] (key)}
      <li>
        <span class="what">{monthKeyLabel(key)}만</span>
        <span class="amount">{formatWon(amount)}</span>
        <ConfirmButton name="{monthKeyLabel(key)} 예산" onconfirm={() => ledger.removeBudgetRule("only", key)} />
      </li>
    {/each}
  </ul>
</div>

<style>
  .cell { margin: 0; padding: 8px 10px; }
  .now { display: flex; justify-content: space-between; gap: 8px; font-size: 0.9rem; color: var(--muted); }
  .now strong { color: var(--text); font-variant-numeric: tabular-nums; }

  .form { display: flex; flex-direction: column; gap: 6px; border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); }
  .scopes { display: flex; flex-wrap: wrap; gap: 4px; }
  .scope {
    height: 30px;
    padding: 0 12px;
    font-size: 0.8rem;
    font-weight: 400;
    color: var(--muted);
    background: var(--panel);
    border: 1px solid var(--line-strong);
    border-radius: 15px;
  }
  .scope.active { color: var(--accent-text); background: var(--accent); border-color: var(--accent); font-weight: 700; }
  /* 설명 글이 범위마다 길이가 달라도 아래 입력 줄이 움직이지 않게 높이를 고정한다. */
  .help { margin: 0; min-height: 3.2em; font-size: 0.78rem; line-height: 1.5; color: var(--muted); }

  .fields { display: flex; gap: 6px; }
  .fields input { flex: 1 1 0; min-width: 0; padding: 9px 8px; font-size: 0.9rem; }
  .fields .month { flex: 0 0 150px; }
  .fields button { flex-shrink: 0; padding: 0 16px; font-size: 0.9rem; }

  ul { list-style: none; margin: 0; padding: 0; }
  li { display: flex; align-items: center; gap: 8px; padding: 6px 10px; border-bottom: 1px solid var(--line); }
  li:last-child { border-bottom: 0; }
  .what { flex: 1; min-width: 0; font-size: 0.9rem; }
  .amount { font-size: 0.9rem; font-weight: 700; font-variant-numeric: tabular-nums; }
  /* 기본값 줄은 지울 수 없다. 지우는 버튼이 있는 줄과 칸 폭을 맞춘다. */
  .fixed { flex: 0 0 42px; }
</style>
