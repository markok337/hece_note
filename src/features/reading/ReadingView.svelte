<script lang="ts">
  import { onMount } from "svelte";
  import { clock } from "../../core/clock.svelte";
  import { monthGrid, parseYmd, shiftMonth, type MonthRef } from "../../core/dates";
  import { session } from "../../core/session.svelte";
  import { viewport } from "../../core/viewport.svelte";
  import Modal from "../../ui/Modal.svelte";
  import { reading } from "./store.svelte";
  import type { Reader, ReadingBook, ReadingNote } from "./domain";

  let month = $state<MonthRef>({ year: parseYmd(clock.today).year, month: parseYmd(clock.today).month });
  let selected = $state<string | null>(null);
  let editingBook = $state<ReadingBook | null>(null);
  let bookDraft = $state<ReadingBook | null>(null);
  let noteDraft = $state<ReadingNote | null>(null);
  let noteBookId = $state<string | null>(null);
  const weeks = $derived(monthGrid(month));
  const panelDay = $derived(viewport.isWide ? (selected ?? clock.today) : selected);

  onMount(() => {
    const refresh = () => { if (document.visibilityState === "visible") void reading.load(); };
    document.addEventListener("visibilitychange", refresh);
    return () => document.removeEventListener("visibilitychange", refresh);
  });

  function newBook(): void {
    bookDraft = { id: crypto.randomUUID(), reader: "행이", title: "", author: "", start_day: selected ?? clock.today, end_day: null, created_at: new Date().toISOString() };
  }

  function editBook(book: ReadingBook): void { bookDraft = { ...book }; }

  async function submitBook(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    if (bookDraft && await reading.putBook({ ...bookDraft, title: bookDraft.title.trim(), author: bookDraft.author.trim(), end_day: bookDraft.end_day || null })) bookDraft = null;
  }

  async function removeBook(book: ReadingBook): Promise<void> {
    if (confirm(`「${book.title}」 책과 메모를 삭제할까?`) && await reading.removeBook(book.id)) editingBook = null;
  }

  function newNote(book: ReadingBook): void {
    noteBookId = book.id;
    noteDraft = { id: crypto.randomUUID(), book_id: book.id, page: "", content: "", position: Math.max(0, ...reading.notesFor(book.id).map((note) => note.position)) + 1 };
  }

  function editNote(note: ReadingNote): void { noteBookId = note.book_id; noteDraft = { ...note }; }

  async function submitNote(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    if (noteDraft && await reading.putNote({ ...noteDraft, page: noteDraft.page.trim(), content: noteDraft.content.trim() })) noteDraft = null;
  }

  async function removeNote(note: ReadingNote): Promise<void> {
    if (confirm("이 메모를 삭제할까?")) await reading.removeNote(note.id);
  }
</script>

<div class="reading" class:wide={viewport.isWide}>
  <header>
    <button type="button" class="sub nav" aria-label="이전 달" onclick={() => month = shiftMonth(month, -1)}>‹</button>
    <h1>{month.year}년 {month.month}월</h1>
    <button type="button" class="sub nav" aria-label="다음 달" onclick={() => month = shiftMonth(month, 1)}>›</button>
    <button type="button" class="sub" onclick={() => month = { year: parseYmd(clock.today).year, month: parseYmd(clock.today).month }}>오늘</button>
    <span class="spacer"></span>
    <button type="button" class="sub" onclick={newBook}>+ 책</button>
    <button type="button" class="sub" aria-label="새로고침" onclick={() => void reading.load()}>↻</button>
    <button type="button" class="sub" aria-label="로그아웃" onclick={() => session.logout()}>⇥</button>
  </header>
  <div class="body">
    <div class="calendar" role="grid" aria-label="독서 달력">
      {#each ["일", "월", "화", "수", "목", "금", "토"] as label}
        <div class="weekday">{label}</div>
      {/each}
      {#each weeks as week}
        {#each week as day}
          {@const books = reading.booksOn(day)}
          <div class="cell" class:outside={parseYmd(day).month !== month.month} class:chosen={panelDay === day}>
            <button type="button" class="date" aria-label="{day} 상세" onclick={() => selected = day}>{parseYmd(day).day}</button>
            <div class="checks">
              <label><input type="checkbox" checked={reading.day(day).haeng} disabled={day > clock.today || !reading.loaded} onchange={(event) => void reading.check(day, "행이", event.currentTarget.checked)} />행</label>
              <label><input type="checkbox" checked={reading.day(day).chaeng} disabled={day > clock.today || !reading.loaded} onchange={(event) => void reading.check(day, "챙이", event.currentTarget.checked)} />챙</label>
            </div>
            <button type="button" class="book-list" aria-label="{day} 책 {books.length}권 보기" onclick={() => selected = day}>
              {#each books.slice(0, viewport.isWide ? 3 : 1) as book (book.id)}
                <span class="book" title="{book.reader} · {book.title}">{book.reader === "행이" ? "행" : "챙"} · {book.title}</span>
              {/each}
              {#if books.length > (viewport.isWide ? 3 : 1)}<span class="more">+{books.length - (viewport.isWide ? 3 : 1)}권</span>{/if}
            </button>
          </div>
        {/each}
      {/each}
    </div>
    {#if viewport.isWide && panelDay}
      <aside class="side">
        {@render dayPanel(panelDay)}
      </aside>
    {/if}
  </div>
  {#if !viewport.isWide && panelDay}
    <Modal label="{panelDay} 독서" onclose={() => selected = null}>
      {@render dayPanel(panelDay)}
    </Modal>
  {/if}
</div>

{#snippet dayPanel(day: string)}
  <h2>{day}</h2>
  <div class="day-checks">
    <label><input type="checkbox" checked={reading.day(day).haeng} disabled={day > clock.today || !reading.loaded} onchange={(event) => void reading.check(day, "행이", event.currentTarget.checked)} /> 행이 독서</label>
    <label><input type="checkbox" checked={reading.day(day).chaeng} disabled={day > clock.today || !reading.loaded} onchange={(event) => void reading.check(day, "챙이", event.currentTarget.checked)} /> 챙이 독서</label>
  </div>
  <div class="section-title"><h3>읽는 책</h3><button type="button" onclick={newBook}>책 추가</button></div>
  {#each reading.booksOn(day) as book (book.id)}
    <button type="button" class="book-card" onclick={() => editingBook = book}>
      <strong>{book.title}</strong><small>{book.reader} · {book.author}</small>
    </button>
  {:else}
    <p class="empty">이날 표시할 책이 없다.</p>
  {/each}
{/snippet}

{#if bookDraft}
  <Modal label="책 입력" onclose={() => bookDraft = null}>
    <h2>책 {reading.books.some((item) => item.id === bookDraft?.id) ? "수정" : "추가"}</h2>
    <form class="editor" onsubmit={submitBook}>
      <label>읽는 사람<select bind:value={bookDraft.reader}><option value="행이">행이</option><option value="챙이">챙이</option></select></label>
      <label>제목<input bind:value={bookDraft.title} required /></label>
      <label>글쓴이<input bind:value={bookDraft.author} required /></label>
      <label>시작일<input type="date" bind:value={bookDraft.start_day} required /></label>
      <label>종료일 <small>읽고 있는 중이면 비워 둔다</small><input type="date" bind:value={bookDraft.end_day} min={bookDraft.start_day} /></label>
      <button type="submit" disabled={!reading.loaded}>저장</button>
    </form>
  </Modal>
{/if}

{#if editingBook}
  <Modal label="책 상세" onclose={() => editingBook = null}>
    {@const book = reading.books.find((item) => item.id === editingBook?.id)}
    {#if book}
      <h2>{book.title}</h2>
      <p>{book.reader} · {book.author}</p>
      <p>{book.start_day} ~ {book.end_day ?? "읽는 중"}</p>
      <div class="actions"><button type="button" class="sub" onclick={() => editBook(book)}>책 수정</button><button type="button" class="sub danger" onclick={() => void removeBook(book)}>책 삭제</button></div>
      <div class="section-title"><h3>메모</h3><button type="button" onclick={() => newNote(book)}>메모 추가</button></div>
      {#each reading.notesFor(book.id) as note (note.id)}
        <div class="note"><strong>{note.page}쪽</strong><p>{note.content}</p><div class="actions"><button type="button" class="sub" onclick={() => editNote(note)}>수정</button><button type="button" class="sub danger" onclick={() => void removeNote(note)}>삭제</button></div></div>
      {:else}<p class="empty">아직 메모가 없다.</p>{/each}
    {/if}
  </Modal>
{/if}

{#if noteDraft && noteBookId}
  <Modal label="메모 입력" onclose={() => noteDraft = null}>
    <h2>메모</h2>
    <form class="editor" onsubmit={submitNote}>
      <label>페이지<input bind:value={noteDraft.page} placeholder="예: 12 또는 12~15" required /></label>
      <label>내용<textarea bind:value={noteDraft.content} rows="6" required></textarea></label>
      <button type="submit" disabled={!reading.loaded}>저장</button>
    </form>
  </Modal>
{/if}

<style>
  .reading { flex: 1; min-height: 0; display: flex; flex-direction: column; }
  header { display: flex; gap: 5px; align-items: center; margin-bottom: 6px; }
  header button { height: 36px; padding: 0 10px; white-space: nowrap; font-size: .85rem; }
  header .nav { font-size: 1.4rem; width: 34px; padding: 0; }
  h1 { font-size: 1.05rem; white-space: nowrap; margin: 0; }
  h2 { font-size: 1.1rem; margin: 0 30px 12px 0; }
  h3 { margin: 0; font-size: .95rem; }
  .spacer { flex: 1; }
  .body { flex: 1; display: flex; min-height: 0; gap: 10px; }
  .calendar { flex: 1; min-width: 0; min-height: 0; display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); grid-template-rows: 24px repeat(6, minmax(0, 1fr)); border: 1px solid var(--line); background: var(--panel); overflow: hidden; }
  .weekday { text-align: center; font-size: .8rem; font-weight: 700; background: var(--table-head); border-right: 1px solid var(--line); }
  .cell { min-width: 0; min-height: 0; padding: 2px; border-top: 1px solid var(--line); border-right: 1px solid var(--line); overflow: hidden; }
  .cell.outside { background: var(--bg); }
  .cell.chosen { box-shadow: inset 0 0 0 2px var(--accent); }
  .date { padding: 0 4px; min-width: 24px; height: 22px; font-size: .8rem; background: transparent; color: var(--text); text-align: left; }
  .checks { display: flex; flex-wrap: wrap; gap: 1px 5px; font-size: .67rem; }
  .checks label, .day-checks label { display: inline-flex; align-items: center; gap: 2px; white-space: nowrap; }
  .checks input, .day-checks input { flex: none; width: 15px; height: 15px; margin: 0; padding: 0; }
  .book-list { display: block; width: 100%; padding: 1px 0; background: transparent; color: var(--text); text-align: left; font-size: .67rem; font-weight: 400; }
  .book { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; background: #dbeafe; border-radius: 3px; margin-top: 2px; padding: 1px 2px; }
  .more { color: var(--muted); }
  .side { width: 320px; flex: none; padding: 14px; overflow-y: auto; background: var(--panel); border: 1px solid var(--line); border-radius: 12px; }
  .day-checks, .actions { display: flex; gap: 12px; flex-wrap: wrap; }
  .day-checks { margin-bottom: 18px; }
  .section-title { display: flex; align-items: center; justify-content: space-between; margin: 12px 0 8px; }
  .section-title button, .actions button { padding: 5px 9px; font-size: .8rem; }
  .book-card { display: block; width: 100%; margin: 5px 0; padding: 9px; text-align: left; color: var(--text); background: var(--bg); border: 1px solid var(--line); }
  .book-card strong, .book-card small { display: block; }
  .book-card small { color: var(--muted); }
  .empty { color: var(--muted); font-size: .85rem; }
  .editor { display: flex; flex-direction: column; }
  .editor label { display: flex; flex-direction: column; gap: 3px; font-size: .85rem; font-weight: 600; }
  .editor input, .editor select, .editor textarea { width: 100%; padding: 9px; border: 1px solid var(--line-strong); border-radius: 8px; font: inherit; background: var(--panel); color: var(--text); }
  .editor small { font-weight: 400; color: var(--muted); }
  .danger { color: var(--danger); }
  .note { padding: 10px 0; border-top: 1px solid var(--line); }
  .note p { white-space: pre-wrap; margin: 4px 0 8px; }
  @media (max-width: 719px) { header { gap: 3px; } header button { padding: 0 6px; } h1 { font-size: .9rem; } .checks { gap: 0; } .book-list { font-size: .6rem; } }
</style>
