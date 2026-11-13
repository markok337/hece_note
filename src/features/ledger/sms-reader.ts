// 폰의 문자함 읽기. 안드로이드 앱(APK)의 SmsInbox 플러그인을 부른다. 웹(브라우저·PWA)에서는 문자를 읽을 수 없다.

import { Capacitor, registerPlugin } from "@capacitor/core";
import { smsCutoff, type Card } from "./domain";
import type { NewSms } from "./store.svelte";

interface SmsInboxPlugin {
  read(options: { senders: string[]; since: number }): Promise<{ messages: Array<{ sender: string; date: number; body: string }> }>;
  summary(options: { since: number; senders: string[] }): Promise<{ total: number; mms?: number; sources?: string[]; senders: Array<{ sender: string; count: number }> }>;
}

const SmsInbox = registerPlugin<SmsInboxPlugin>("SmsInbox");

/** 문자를 읽을 수 있는 환경(안드로이드 앱)인가. */
export function canReadSms(): boolean {
  return Capacitor.isNativePlatform();
}

/** 문자 하나를 가리키는 식별값. 번호·받은 시각·본문이 같으면 어느 기기에서 읽어도 같다. */
export function smsKey(sender: string, receivedAt: number, body: string): string {
  // FNV-1a 32비트 해시. 본문을 그대로 키에 넣지 않으려는 것이고, 번호와 시각이 같이 들어가 겹칠 일은 사실상 없다.
  let hash = 0x811c9dc5;
  for (let i = 0; i < body.length; i++) {
    hash ^= body.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `sms:${sender}:${receivedAt}:${(hash >>> 0).toString(16)}`;
}

/**
 * 등록한 번호의 문자가 안 보일 때 쓰는 점검 문구. 문자함의 최근 30일 전체 건수와 번호별 건수를 보여 준다(본문은 읽지 않는다).
 */
export async function inboxSummary(registered: readonly string[], now = new Date()): Promise<string> {
  const { total, mms = 0, sources = [], senders } = await SmsInbox.summary({ since: smsCutoff(now), senders: [...registered] });
  if (total === 0) return "문자함에 최근 30일 문자가 한 건도 없다.";
  // 재난문자(#CMAS#…)는 많아서 목록을 채우므로 뺀다.
  const shown = senders.filter((item) => !item.sender.startsWith("#CMAS#"));
  const top = [...shown].sort((a, b) => b.count - a.count).slice(0, 12);
  const lines = [
    ...sources,
    `받은 문자 ${total}건(장문·사진 ${mms}건). 번호별: ${top.map((item) => `${item.sender || "(번호 없음)"} ${item.count}건`).join(", ")}`,
  ];
  return lines.join(" | ");
}

/**
 * 등록한 카드의 발신번호로 온 최근 30일치 문자를 읽는다. 권한이 없으면 폰이 허용을 묻고, 거절하면 예외가 난다.
 * 등록한 번호의 문자만 읽으며 다른 문자는 앱에 넘어오지 않는다.
 */
export async function readSms(cards: readonly Card[], now = new Date()): Promise<NewSms[]> {
  const senders = [...new Set(cards.map((card) => card.sender))];
  if (senders.length === 0) return [];
  const { messages } = await SmsInbox.read({ senders, since: smsCutoff(now) });
  return messages.map((message) => ({
    sms_key: smsKey(message.sender, message.date, message.body),
    sender: message.sender,
    received_at: new Date(message.date).toISOString(),
    body: message.body,
  }));
}
