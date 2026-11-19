import type { RealtimeChannel } from "@supabase/supabase-js";
import { clock } from "../../core/clock.svelte";
import { notice } from "../../core/notice.svelte";
import { SyncedStore, type Receive, type StatusHandler } from "../../core/synced-store.svelte";
import { bookOnDay, validateBook, type Reader, type ReadingBook, type ReadingDay, type ReadingNote } from "./domain";
import { deleteBook, deleteNote, fetchReading, saveBook, saveDay, saveNote, subscribeReading, unsubscribe } from "./repo";

type Snapshot = Awaited<ReturnType<typeof fetchReading>>;

class ReadingStore extends SyncedStore<Snapshot> {
  books = $state<ReadingBook[]>([]);
  notes = $state<ReadingNote[]>([]);
  days = $state<Record<string, ReadingDay>>({});

  booksOn(day: string): ReadingBook[] {
    return this.books.filter((book) => bookOnDay(book, day, clock.today));
  }

  notesFor(bookId: string): ReadingNote[] {
    return this.notes.filter((note) => note.book_id === bookId).sort((a, b) => a.position - b.position);
  }

  day(day: string): ReadingDay {
    return this.days[day] ?? { day, haeng: false, chaeng: false };
  }

  protected fetchSnapshot(): Promise<Snapshot> { return fetchReading(); }
  protected applySnapshot(snapshot: Snapshot): void {
    this.books = snapshot.books;
    this.notes = snapshot.notes;
    this.days = Object.fromEntries(snapshot.days.map((day) => [day.day, day]));
  }
  protected clearData(): void { this.books = []; this.notes = []; this.days = {}; }
  protected subscribe(receive: Receive, onStatus: StatusHandler): RealtimeChannel {
    return subscribeReading(() => receive(() => void this.load()), onStatus);
  }
  protected unsubscribe(channel: RealtimeChannel): Promise<void> { return unsubscribe(channel); }

  async putBook(book: ReadingBook): Promise<boolean> {
    const error = validateBook(book);
    if (error) { notice.say("err", error); return false; }
    return this.write(
      () => { this.books = [...this.books.filter((item) => item.id !== book.id), book]; },
      () => saveBook(book), "책 저장 실패",
    );
  }

  async removeBook(id: string): Promise<boolean> {
    return this.write(
      () => { this.books = this.books.filter((book) => book.id !== id); this.notes = this.notes.filter((note) => note.book_id !== id); },
      () => deleteBook(id), "책 삭제 실패",
    );
  }

  async putNote(note: ReadingNote): Promise<boolean> {
    if (!note.page.trim() || !note.content.trim()) { notice.say("err", "페이지와 내용을 입력한다."); return false; }
    return this.write(
      () => { this.notes = [...this.notes.filter((item) => item.id !== note.id), note]; },
      () => saveNote(note), "메모 저장 실패",
    );
  }

  async removeNote(id: string): Promise<boolean> {
    return this.write(() => { this.notes = this.notes.filter((note) => note.id !== id); }, () => deleteNote(id), "메모 삭제 실패");
  }

  async check(day: string, reader: Reader, checked: boolean): Promise<boolean> {
    if (day > clock.today) { notice.say("err", "미래 날짜는 체크할 수 없다."); return false; }
    const next = { ...this.day(day), [reader === "행이" ? "haeng" : "chaeng"]: checked };
    return this.write(() => { this.days[day] = next; }, () => saveDay(next), "독서 체크 저장 실패");
  }
}

export const reading = new ReadingStore();
