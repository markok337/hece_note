export type Reader = "행이" | "챙이";

export interface ReadingBook {
  id: string;
  reader: Reader;
  title: string;
  author: string;
  start_day: string;
  end_day: string | null;
  created_at: string;
}

export interface ReadingNote {
  id: string;
  book_id: string;
  page: string;
  content: string;
  position: number;
}

export interface ReadingDay {
  day: string;
  haeng: boolean;
  chaeng: boolean;
}

export function bookOnDay(book: ReadingBook, day: string, today: string): boolean {
  return book.start_day <= day && day <= (book.end_day ?? today);
}

export interface WeekBookSegment {
  book: ReadingBook;
  start: number;
  end: number;
  lane: number;
  continuesBefore: boolean;
  continuesAfter: boolean;
}

/** 한 주에 걸친 책을 끊기지 않는 막대로 배치한다. 같은 줄에서 기간이 겹치면 다음 줄로 내린다. */
export function weekBookSegments(week: string[], books: ReadingBook[], today: string): WeekBookSegment[] {
  const segments = books.flatMap((book) => {
    const start = week.findIndex((day) => bookOnDay(book, day, today));
    if (start < 0) return [];
    let end = start;
    while (end + 1 < week.length && bookOnDay(book, week[end + 1], today)) end += 1;
    const last = book.end_day ?? today;
    return [{ book, start, end, lane: 0, continuesBefore: book.start_day < week[0], continuesAfter: last > week[6] }];
  }).sort((a, b) => a.start - b.start || b.end - a.end || a.book.created_at.localeCompare(b.book.created_at));
  const occupied: number[] = [];
  for (const segment of segments) {
    let lane = occupied.findIndex((end) => end < segment.start);
    if (lane < 0) lane = occupied.length;
    occupied[lane] = segment.end;
    segment.lane = lane;
  }
  return segments;
}

export function validateBook(book: ReadingBook): string | null {
  if (!book.title.trim()) return "책 제목을 입력한다.";
  if (!book.author.trim()) return "글쓴이를 입력한다.";
  if (book.end_day && book.end_day < book.start_day) return "종료일은 시작일보다 빠를 수 없다.";
  return null;
}
