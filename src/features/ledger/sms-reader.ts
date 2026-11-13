// 폰의 문자함 읽기. 안드로이드 앱(APK)의 SmsInbox 플러그인을 부른다. 웹(브라우저·PWA)에서는 문자를 읽을 수 없다.

import { Capacitor, registerPlugin } from "@capacitor/core";
import { smsCutoff, type Card } from "./domain";
import type { NewSms } from "./store.svelte";

interface SmsInboxPlugin {
  read(options: { senders: string[]; since: number }): Promise<{ messages: Array<{ sender: string; date: number; body: string }> }>;
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
