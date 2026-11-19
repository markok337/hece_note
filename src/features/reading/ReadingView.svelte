<script lang="ts">
  import { onMount } from "svelte";
  import { clock } from "../../core/clock.svelte";
  import { monthGrid, parseYmd, shiftMonth, type MonthRef } from "../../core/dates";
  import { session } from "../../core/session.svelte";
  import Modal from "../../ui/Modal.svelte";
  import { reading } from "./store.svelte";
  import { weekBookSegments, type ReadingBook, type ReadingNote } from "./domain";

  let month = $state<MonthRef>({ year: parseYmd(clock.today).year, month: parseYmd(clock.today).month });
  let selected = $state<string | null>(null);
  let editingBook = $state<ReadingBook | null>(null);
  let bookDraft = $state<ReadingBook | null>(null);
  let noteDraft = $state<ReadingNote | null>(null);
  let noteBookId = $state<string | null>(null);
  const weeks = $derived(monthGrid(month));

  function chooseDay(day: string): void {
    selected = day;
    const { year, month: selectedMonth } = parseYmd(day);
    if (year !== month.year || selectedMonth !== month.month) month = { year, month: selectedMonth };
  }

  onMount(() => {
    const refresh = () => { if (document.visibilityState === "visible") void reading.load(); };
    document.addEventListener("visibilitychange", refresh);
    return () => document.removeEventListener("visibilitychange", refresh);
  });

  function newBook(): void {
    bookDraft = { id: crypto.randomUUID(), reader: "행이", title: "", author: "", start_day: selected ?? clock.today, end_day: null, created_at: new Date().toISOString() };
  }

  function editBook(book: ReadingBook): void { bookDraft = { ...book }; }

  async function completeBook(book: ReadingBook): Promise<void> {
    if (book.end_day || book.start_day > clock.today) return;
    await reading.putBook({ ...book, end_day: clock.today });
  }

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

<div class="reading">
  <header class="toolbar">
    <h1>{month.year}년 {month.month}월</h1>
    <div class="toolbar-actions">
      <button type="button" class="sub icon" aria-label="이전 달" onclick={() => { month = shiftMonth(month, -1); selected = null; }}>‹</button>
      <button type="button" class="sub icon" aria-label="다음 달" onclick={() => { month = shiftMonth(month, 1); selected = null; }}>›</button>
      <button type="button" class="sub compact" onclick={() => { month = { year: parseYmd(clock.today).year, month: parseYmd(clock.today).month }; selected = clock.today; }}>오늘</button>
      <button type="button" class="primary compact" onclick={newBook}>+ 책</button>
      <button type="button" class="sub icon utility" aria-label="새로고침" onclick={() => void reading.load()}>↻</button>
      <button type="button" class="sub icon utility" aria-label="로그아웃" onclick={() => session.logout()}>⇥</button>
    </div>
  </header>
  <div class="body">
    <div class="calendar" aria-label="독서 달력">
      <div class="weekdays">
        {#each ["일", "월", "화", "수", "목", "금", "토"] as label}<div>{label}</div>{/each}
      </div>
      <div class="weeks">
        {#each weeks as week (week[0])}
          {@const segments = weekBookSegments(week, reading.books, clock.today)}
          {@const laneCount = segments.length ? Math.max(...segments.map((segment) => segment.lane)) + 1 : 1}
          <div class="week" style:grid-template-rows="38px repeat({laneCount}, minmax(24px, 1fr))" style:min-height="{Math.max(82, 42 + laneCount * 24)}px" style:flex-grow={1}>
            {#each week as day, index (day)}
              <button
                type="button"
                class="day"
                class:outside={parseYmd(day).month !== month.month}
                class:chosen={selected === day}
                class:today={day === clock.today}
                style:grid-column={index + 1}
                aria-label="{day} 독서 기록 보기. 행이 {reading.day(day).haeng ? '읽음' : '미체크'}, 챙이 {reading.day(day).chaeng ? '읽음' : '미체크'}"
                onclick={() => chooseDay(day)}
              >
                <span class="day-number">{parseYmd(day).day}</span>
                <span class="day-marks"><span class="haeng-mark" class:read={reading.day(day).haeng}>행</span><span class="chaeng-mark" class:read={reading.day(day).chaeng}>챙</span></span>
              </button>
            {/each}
            {#each segments as segment (segment.book.id)}
              <div
                class="period"
                class:haeng={segment.book.reader === "행이"}
                class:chaeng={segment.book.reader === "챙이"}
                class:continues-before={segment.continuesBefore}
                class:continues-after={segment.continuesAfter}
                style:grid-column="{segment.start + 1} / {segment.end + 2}"
                style:grid-row={segment.lane + 2}
                title="{segment.book.reader} · {segment.book.title}"
              ><span>{segment.book.reader === "행이" ? "행" : "챙"} · {segment.book.title}</span></div>
            {/each}
          </div>
        {/each}
      </div>
    </div>
  </div>
  {#if selected}
    <Modal label="{selected} 독서" onclose={() => selected = null}>
      {@render dayPanel(selected)}
    </Modal>
  {/if}
</div>

{#snippet dayPanel(day: string)}
  <div class="day-top">
    <h2>{parseYmd(day).month}월 {parseYmd(day).day}일</h2>
    <div class="day-checks" role="group" aria-label="독서 체크">
      <label class:checked={reading.day(day).haeng}><input type="checkbox" checked={reading.day(day).haeng} disabled={day > clock.today || !reading.loaded} onchange={(event) => void reading.check(day, "행이", event.currentTarget.checked)} /> <span>행이</span></label>
      <label class:checked={reading.day(day).chaeng}><input type="checkbox" checked={reading.day(day).chaeng} disabled={day > clock.today || !reading.loaded} onchange={(event) => void reading.check(day, "챙이", event.currentTarget.checked)} /> <span>챙이</span></label>
    </div>
  </div>
  {#if reading.booksOn(day).length > 0}
    <section class="day-books">
      {#each reading.booksOn(day) as book (book.id)}
        <div class="book-card">
          <button type="button" class="book-info" onclick={() => editingBook = book}><span class:haeng-text={book.reader === "행이"} class:chaeng-text={book.reader === "챙이"} class="reader-tag">{book.reader}</span><strong>{book.title}</strong><small>{book.author}</small></button>
          {#if !book.end_day && book.start_day <= clock.today}<button type="button" class="sub small" aria-label="{book.title} 완독" disabled={!reading.loaded} onclick={() => void completeBook(book)}>완독</button>{/if}
          <button type="button" class="sub small" aria-label="{book.title} 수정" onclick={() => editBook(book)}>수정</button>
        </div>
      {/each}
    </section>
  {/if}
{/snippet}

{#if bookDraft}
  <Modal label="책 입력" wide layer={70} onclose={() => bookDraft = null}>
    <h2>책 {reading.books.some((item) => item.id === bookDraft?.id) ? "수정" : "추가"}</h2>
    <form class="editor" onsubmit={submitBook}>
      <div class="editor-fields">
        <label class="full">제목<input bind:value={bookDraft.title} required /></label>
        <label>읽는 사람<select bind:value={bookDraft.reader}><option value="행이">행이</option><option value="챙이">챙이</option></select></label>
        <label>글쓴이<input bind:value={bookDraft.author} required /></label>
        <label>시작일<input type="date" bind:value={bookDraft.start_day} required /></label>
        <label>종료일<input type="date" bind:value={bookDraft.end_day} min={bookDraft.start_day} /></label>
      </div>
      <div class="form-actions"><button type="button" class="sub" onclick={() => bookDraft = null}>취소</button><button type="submit" disabled={!reading.loaded}>책 저장</button></div>
    </form>
  </Modal>
{/if}

{#if editingBook}
  <Modal label="책 상세" extraWide layer={60} onclose={() => editingBook = null}>
    {@const book = reading.books.find((item) => item.id === editingBook?.id)}
    {#if book}
      <h2>{book.title}</h2>
      <div class="book-summary">
        <span class:haeng-text={book.reader === "행이"} class:chaeng-text={book.reader === "챙이"} class="reader-tag">{book.reader}</span>
        <span class="book-meta">{book.author}</span>
        <span class="book-dates">{book.start_day} ~ {book.end_day ?? "읽는 중"}</span>
        <div class="actions">{#if !book.end_day && book.start_day <= clock.today}<button type="button" class="sub" disabled={!reading.loaded} onclick={() => void completeBook(book)}>완독</button>{/if}<button type="button" class="sub" onclick={() => editBook(book)}>책 수정</button><button type="button" class="sub danger" onclick={() => void removeBook(book)}>책 삭제</button></div>
      </div>
      <div class="section-title"><h3>메모</h3><button type="button" class="sub small" onclick={() => newNote(book)}>+ 메모</button></div>
      {#each reading.notesFor(book.id) as note (note.id)}
        <div class="note"><div class="note-head"><strong>{note.page}쪽</strong><div class="actions"><button type="button" class="sub" onclick={() => editNote(note)}>수정</button><button type="button" class="sub danger" onclick={() => void removeNote(note)}>삭제</button></div></div><p>{note.content}</p></div>
      {/each}
    {/if}
  </Modal>
{/if}

{#if noteDraft && noteBookId}
  <Modal label="메모 입력" wide layer={70} onclose={() => noteDraft = null}>
    <h2>메모</h2>
    <form class="editor" onsubmit={submitNote}>
      <label>페이지<input bind:value={noteDraft.page} placeholder="예: 12 또는 12~15" required /></label>
      <label>내용<textarea bind:value={noteDraft.content} rows="6" required></textarea></label>
      <div class="form-actions"><button type="button" class="sub" onclick={() => noteDraft = null}>취소</button><button type="submit" disabled={!reading.loaded}>메모 저장</button></div>
    </form>
  </Modal>
{/if}

<style>
  .reading { flex: 1; width: 100%; min-width: 0; min-height: 0; display: flex; flex-direction: column; }
  .toolbar { display: flex; justify-content: space-between; align-items: center; gap: 10px; padding: 2px 2px 8px; }
  h1 { font-size: 1.2rem; line-height: 1.2; white-space: nowrap; margin: 0; }
  h2 { font-size: 1.2rem; line-height: 1.25; margin: 3px 44px 8px 0; }
  h3 { margin: 0; font-size: .95rem; }
  .toolbar-actions { display: flex; gap: 5px; align-items: center; }
  .toolbar button { height: 36px; white-space: nowrap; font-size: .82rem; }
  .toolbar .icon { width: 36px; padding: 0; font-size: 1.3rem; }
  .toolbar .compact { padding: 0 10px; }
  .primary { background: var(--accent); color: var(--accent-text); }
  .body { flex: 1; display: flex; min-height: 0; gap: 12px; }
  .calendar { flex: 1; min-width: 0; min-height: 0; display: flex; flex-direction: column; overflow: hidden; background: var(--panel); border: 1px solid var(--line); border-radius: 12px; box-shadow: var(--shadow); }
  .weekdays { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); background: var(--table-head); border-bottom: 1px solid var(--line); }
  .weekdays div { padding: 5px; text-align: center; font-size: .78rem; font-weight: 700; }
  .weekdays div:first-child { color: #b91c1c; }
  .weeks { flex: 1; min-height: 0; display: flex; flex-direction: column; overflow-y: auto; }
  .week { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); min-height: 82px; border-bottom: 1px solid var(--line); background: repeating-linear-gradient(to right, transparent 0, transparent calc(14.2857% - 1px), var(--line) calc(14.2857% - 1px), var(--line) 14.2857%); }
  .week:last-child { border-bottom: 0; }
  .day { grid-row: 1 / -1; display: flex; align-items: flex-start; justify-content: space-between; gap: 3px; min-width: 0; overflow: hidden; padding: 4px 5px; background: transparent; color: var(--text); text-align: left; border-radius: 0; }
  .day:hover { background: #eff6ff; }
  .day.chosen { background: #dbeafe; box-shadow: inset 0 0 0 2px var(--accent); }
  .day.outside { color: var(--muted); background: rgb(226 232 240 / .45); }
  .day.today .day-number { background: var(--today); color: white; border-radius: 50%; }
  .day-number { flex: none; display: inline-grid; place-items: center; width: 22px; height: 22px; font-size: .8rem; line-height: 1; }
  .day-marks { flex: none; display: flex; gap: 3px; font-size: .58rem; line-height: 1; }
  .day-marks span { display: grid; place-items: center; width: 17px; height: 14px; border-radius: 3px; color: #334155; background: #dbe2eb; font-weight: 800; }
  .day-marks .haeng-mark.read { color: white; background: #1d4ed8; }
  .day-marks .chaeng-mark.read { color: white; background: #be185d; }
  .period { z-index: 1; pointer-events: none; align-self: start; display: block; min-width: 0; height: 21px; margin: 1px 2px; padding: 1px 7px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-align: left; border: 1px solid transparent; border-radius: 6px; font-size: .7rem; line-height: 17px; font-weight: 700; }
  .period span { overflow: hidden; text-overflow: ellipsis; }
  .period.haeng { background: #dbeafe; color: #1e3a8a; border-color: #93c5fd; }
  .period.chaeng { background: #fce7f3; color: #9d174d; border-color: #f9a8d4; }
  .period.continues-before { border-top-left-radius: 0; border-bottom-left-radius: 0; margin-left: 0; }
  .period.continues-after { border-top-right-radius: 0; border-bottom-right-radius: 0; margin-right: 0; }
  .day-top { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; padding-right: 42px; }
  .day-top h2 { flex: none; margin: 0; }
  .day-books { margin-top: 12px; padding-top: 10px; border-top: 1px solid var(--line); }
  .section-title { display: flex; align-items: center; justify-content: space-between; gap: 6px; margin-bottom: 10px; }
  .day-checks, .actions { display: flex; gap: 5px; flex-wrap: wrap; }
  .day-checks label { display: flex; align-items: center; gap: 4px; padding: 6px; border: 1px solid var(--line); border-radius: 7px; cursor: pointer; font-size: .82rem; font-weight: 700; }
  .day-checks label.checked { background: #eff6ff; border-color: var(--accent); }
  .day-checks input { flex: none; width: 16px; height: 16px; margin: 0; padding: 0; accent-color: var(--accent); }
  .small, .actions button { padding: 5px 9px; font-size: .8rem; }
  .book-card { display: flex; align-items: center; gap: 6px; width: 100%; margin: 6px 0; padding: 5px; color: var(--text); background: #f8fafc; border: 1px solid var(--line); border-radius: 9px; }
  .book-card > .small { flex: none; white-space: nowrap; }
  .book-info { flex: 1; display: flex; flex-wrap: wrap; align-items: center; gap: 3px 6px; min-width: 0; padding: 4px; text-align: left; color: var(--text); background: transparent; }
  .book-info strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .book-info small { flex-basis: 100%; color: var(--muted); }
  .reader-tag { flex: none; padding: 2px 5px; border-radius: 4px; font-size: .7rem; }
  .haeng-text { color: #1e3a8a; background: #dbeafe; }
  .chaeng-text { color: #9d174d; background: #fce7f3; }
  .editor { display: flex; flex-direction: column; }
  .editor-fields { display: grid; gap: 8px; }
  .editor label { display: flex; flex-direction: column; gap: 3px; font-size: .85rem; font-weight: 600; }
  .editor input, .editor select, .editor textarea { width: 100%; padding: 9px; border: 1px solid var(--line-strong); border-radius: 8px; font: inherit; background: var(--panel); color: var(--text); }
  .form-actions { display: flex; justify-content: end; gap: 8px; margin-top: 6px; }
  .form-actions button { padding: 9px 14px; font-size: .88rem; }
  .book-summary { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; margin: 4px 0 14px; }
  .book-meta { color: var(--muted); }
  .book-dates { padding: 5px 9px; border-radius: 6px; background: var(--bg); font-size: .82rem; }
  .book-summary .actions { margin-left: auto; }
  .danger { color: var(--danger); }
  .note { padding: 10px 0; border-top: 1px solid var(--line); }
  .note-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .note p { white-space: pre-wrap; margin: 4px 0 8px; }
  @media (min-width: 360px) {
    .editor-fields { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .editor-fields .full { grid-column: 1 / -1; }
  }
  @media (max-width: 1100px) {
    .day { gap: 2px; padding: 2px 1px; }
    .day-number { width: 14px; height: 18px; font-size: .68rem; }
    .day-marks { gap: 2px; font-size: .5rem; }
    .day-marks span { width: 10px; height: 14px; }
  }
  @media (min-width: 360px) and (max-width: 1100px) {
    .day { gap: 2px; padding: 2px; }
    .day-number { width: 14px; font-size: .74rem; }
    .day-marks { font-size: .6rem; }
    .day-marks span { width: 10px; height: 16px; }
  }
  @media (max-width: 719px) {
    .toolbar { align-items: center; }
    h1 { font-size: 1rem; }
    .toolbar-actions { gap: 3px; }
    .toolbar .icon { width: 30px; height: 32px; }
    .toolbar .compact { height: 32px; padding: 0 6px; font-size: .74rem; }
    .toolbar .utility { display: none; }
    .period { padding: 1px 3px; font-size: .62rem; }
  }
</style>
