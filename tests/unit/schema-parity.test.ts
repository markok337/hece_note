// 잠금 규칙과 선택지가 TS(domain)와 SQL 제약에서 서로 같은지 확인한다. 한쪽만 고치면 여기서 깨진다.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ASSIGNEES, CATEGORIES, CHECKS } from "../../src/features/blog/domain";

const sql = readFileSync("supabase/migrations/0002_blog.sql", "utf-8");

/** SQL 의 잠금 제약에서 "앞 항목 없으면 뒤 항목 없음" 쌍을 [뒤, 앞] 으로 뽑는다. */
function sqlLocks(): Array<[string, string]> {
  const pairs: Array<[string, string]> = [];
  for (const m of sql.matchAll(/constraint blog_days_lock_\w+\s+check \(not\s+(\w+)\s+or\s+(\w+)/g)) {
    pairs.push([m[1], m[2]]);
  }
  const topic = /check \(topic is null or assignee is not null\)/.test(sql);
  if (topic) pairs.push(["topic", "assignee"]);
  return pairs;
}

describe("TS 규칙과 SQL 제약", () => {
  it("잠금 순서가 같다", () => {
    const expected: Array<[string, string]> = [["topic", "assignee"], ["photo", "topic"]];
    for (let i = 1; i < CHECKS.length; i += 1) expected.push([CHECKS[i], CHECKS[i - 1]]);
    const key = (p: Array<string>) => p.join("<-");
    expect(sqlLocks().map(key).sort()).toEqual(expected.map(key).sort());
  });

  it("분야 선택지가 같다", () => {
    const list = sql.match(/category\s+text\s+not null\s+check \(category in \(([^)]*)\)/)![1];
    expect([...list.matchAll(/'([^']+)'/g)].map((m) => m[1])).toEqual([...CATEGORIES]);
  });

  it("담당 선택지가 같다", () => {
    const list = sql.match(/assignee\s+text\s+check \(assignee in \(([^)]*)\)/)![1];
    expect([...list.matchAll(/'([^']+)'/g)].map((m) => m[1])).toEqual([...ASSIGNEES]);
  });
});
