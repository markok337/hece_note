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

export function validateBook(book: ReadingBook): string | null {
  if (!book.title.trim()) return "책 제목을 입력한다.";
  if (!book.author.trim()) return "글쓴이를 입력한다.";
  if (book.end_day && book.end_day < book.start_day) return "종료일은 시작일보다 빠를 수 없다.";
  return null;
}
