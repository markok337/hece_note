import type { RealtimeChannel } from "@supabase/supabase-js";
import { fetchAllPages } from "../../core/paging";
import { supabase } from "../../supabase";
import type { ReadingBook, ReadingDay, ReadingNote } from "./domain";

function client() {
  if (!supabase) throw new Error("Supabase 설정이 비어 있다.");
  return supabase;
}

export async function fetchReading() {
  const [books, notes, days] = await Promise.all([
    fetchAllPages(async (from, to) => {
      const { data, error } = await client().from("reading_books").select("id,reader,title,author,start_day,end_day,created_at").order("created_at").range(from, to);
      if (error) throw error;
      return data as ReadingBook[];
    }),
    fetchAllPages(async (from, to) => {
      const { data, error } = await client().from("reading_notes").select("id,book_id,page,content,position").order("position").range(from, to);
      if (error) throw error;
      return data as ReadingNote[];
    }),
    fetchAllPages(async (from, to) => {
      const { data, error } = await client().from("reading_days").select("day,haeng,chaeng").order("day").range(from, to);
      if (error) throw error;
      return data as ReadingDay[];
    }),
  ]);
  return { books, notes, days };
}

export async function saveBook(book: ReadingBook): Promise<void> {
  const { error } = await client().from("reading_books").upsert(book);
  if (error) throw error;
}

export async function deleteBook(id: string): Promise<void> {
  const { error } = await client().from("reading_books").delete().eq("id", id);
  if (error) throw error;
}

export async function saveNote(note: ReadingNote): Promise<void> {
  const { error } = await client().from("reading_notes").upsert(note);
  if (error) throw error;
}

export async function deleteNote(id: string): Promise<void> {
  const { error } = await client().from("reading_notes").delete().eq("id", id);
  if (error) throw error;
}

export async function saveDay(day: ReadingDay): Promise<void> {
  const { error } = await client().from("reading_days").upsert(day, { onConflict: "day" });
  if (error) throw error;
}

export function subscribeReading(onChange: () => void, onStatus: (live: boolean) => void): RealtimeChannel {
  const channel = client().channel("reading_feed");
  for (const table of ["reading_books", "reading_notes", "reading_days"]) {
    channel.on("postgres_changes", { event: "*", schema: "public", table }, onChange);
  }
  return channel.subscribe((status) => onStatus(status === "SUBSCRIBED"));
}

export async function unsubscribe(channel: RealtimeChannel): Promise<void> {
  await client().removeChannel(channel);
}
