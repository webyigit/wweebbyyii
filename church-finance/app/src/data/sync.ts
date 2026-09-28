// 기기 안 데이터베이스(IndexedDB) ↔ 클라우드(Supabase `records` 표) 동기화.
//
// 원리 (docs/05-DB설계.md "동기화"):
//  1) 보내기: 각 기록의 내용 지문(hash)을 '마지막으로 보낸 지문'과 비교해서 바뀐 것만 올린다.
//     → 어떤 화면·어떤 경로로 저장했든 빠짐없이 올라간다 (저장할 때 표시를 붙이는 방식보다 튼튼함)
//  2) 받기: 서버에서 '마지막으로 받은 시각' 이후 바뀐 기록만 받아 기기에 넣는다.
//  3) 항상 보내기 먼저 → 기기에서 방금 고친 것이 받기에 덮이지 않는다.
//  같은 기록을 두 기기가 고치면 나중에 올린 쪽이 남고, 앞의 내용은 서버 이력(record_history)에 남는다.
import type { Table } from "dexie";
import { db, type FinanceDB } from "./db";

export interface RemoteRecord { collection: string; id: string; doc: unknown; deleted: boolean; updated_at: string }

/** 클라우드 쪽 동작 — 실제로는 Supabase, 테스트에서는 흉내 서버 */
export interface Remote {
  upsert(rows: { collection: string; id: string; doc: unknown; deleted: boolean }[]): Promise<void>;
  pullSince(cursor: string | null, limit: number): Promise<RemoteRecord[]>;
}

type AnyTable = Table<Record<string, unknown>, unknown>;
interface Collection { name: string; table: (d: FinanceDB) => AnyTable; idOf: (row: Record<string, unknown>) => string }

// 동기화하는 표들. 복합 키는 "|" 로 이어서 id 로 쓴다.
export const COLLECTIONS: Collection[] = [
  { name: "households", table: (d) => d.households as unknown as AnyTable, idOf: (r) => String(r.id) },
  { name: "members", table: (d) => d.members as unknown as AnyTable, idOf: (r) => String(r.id) },
  { name: "aliases", table: (d) => d.aliases as unknown as AnyTable, idOf: (r) => String(r.id) },
  { name: "offerings", table: (d) => d.offerings as unknown as AnyTable, idOf: (r) => String(r.id) },
  { name: "expenses", table: (d) => d.expenses as unknown as AnyTable, idOf: (r) => String(r.id) },
  { name: "fixedRules", table: (d) => d.fixedRules as unknown as AnyTable, idOf: (r) => String(r.id) },
  { name: "budgets", table: (d) => d.budgets as unknown as AnyTable, idOf: (r) => `${r.year}|${r.code}` },
  { name: "openings", table: (d) => d.openings as unknown as AnyTable, idOf: (r) => `${r.year}|${r.key}` },
  { name: "categories", table: (d) => d.categories as unknown as AnyTable, idOf: (r) => String(r.code) },
  { name: "expenseItems", table: (d) => d.expenseItems as unknown as AnyTable, idOf: (r) => String(r.code) },
  { name: "bankTxns", table: (d) => d.bankTxns as unknown as AnyTable, idOf: (r) => String(r.key) },
  { name: "bankRules", table: (d) => d.bankRules as unknown as AnyTable, idOf: (r) => String(r.content) },
];

/** 비교용 지문: 기기에서만 쓰는 칸(dirty)은 빼고, 칸 순서와 무관하게 */
export function fingerprint(row: Record<string, unknown>): string {
  const clean: Record<string, unknown> = {};
  for (const k of Object.keys(row).sort()) if (k !== "dirty") clean[k] = row[k];
  const s = JSON.stringify(clean);
  let h = 2166136261; // FNV-1a
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36) + s.length.toString(36);
}

const SENT = "sync:sent"; // { [collection|id]: fingerprint }
const CURSOR = "sync:cursor";

export interface SyncResult { pushed: number; pulled: number; at: string }

/** 역할별로 쓸 수 있는 종류 — 서버 규칙(supabase/schema.sql 의 can_write)과 같아야 한다 */
export const WRITABLE: Record<string, string[]> = {
  bookkeeper: ["offerings", "households", "members", "aliases", "categories", "budgets"],
  cashier: ["expenses", "fixedRules", "budgets", "openings", "bankTxns", "bankRules", "expenseItems", "offerings"],
  finance_head: [],
  pastor: [],
};

export async function syncOnce(remote: Remote, d: FinanceDB = db, batch = 500, role = "bookkeeper"): Promise<SyncResult> {
  const canWrite = new Set(WRITABLE[role] ?? []);
  const sent = ((await d.meta.get(SENT))?.value as Record<string, string>) ?? {};

  // 1) 보내기
  const out: { collection: string; id: string; doc: unknown; deleted: boolean }[] = [];
  const outFp: [string, string][] = [];
  for (const c of COLLECTIONS) {
    if (!canWrite.has(c.name)) continue; // 이 역할이 쓸 수 없는 종류는 보내지 않음 (받기만)
    for (const row of await c.table(d).toArray()) {
      const id = c.idOf(row);
      const fp = fingerprint(row);
      const k = `${c.name}|${id}`;
      if (sent[k] === fp) continue;
      const { dirty: _dirty, ...doc } = row;
      void _dirty;
      out.push({ collection: c.name, id, doc, deleted: !!row.deleted });
      outFp.push([k, fp]);
    }
  }
  for (let i = 0; i < out.length; i += batch) {
    await remote.upsert(out.slice(i, i + batch));
    for (const [k, fp] of outFp.slice(i, i + batch)) sent[k] = fp;
    await d.meta.put({ key: SENT, value: sent }); // 조금씩 저장 → 중간에 끊겨도 다시 처음부터 보내지 않음
  }

  // 2) 받기
  let cursor = ((await d.meta.get(CURSOR))?.value as string | undefined) ?? null;
  let pulled = 0;
  const byName = new Map(COLLECTIONS.map((c) => [c.name, c]));
  for (;;) {
    const rows = await remote.pullSince(cursor, batch);
    if (!rows.length) break;
    await d.transaction("rw", [...COLLECTIONS.map((c) => c.table(d)), d.meta], async () => {
      for (const r of rows) {
        const c = byName.get(r.collection);
        if (!c) continue;
        const doc = { ...(r.doc as Record<string, unknown>), dirty: 0 };
        await c.table(d).put(doc);
        sent[`${r.collection}|${r.id}`] = fingerprint(doc); // 받은 것은 다시 보내지 않음
        pulled++;
      }
      cursor = rows[rows.length - 1].updated_at;
      await d.meta.put({ key: SENT, value: sent });
      await d.meta.put({ key: CURSOR, value: cursor });
    });
    if (rows.length < batch) break;
  }
  const at = new Date().toISOString();
  await d.meta.put({ key: "sync:lastAt", value: at });
  return { pushed: out.length, pulled, at };
}

/** 아직 안 올라간 기록 수 (화면 표시용) */
export async function pendingCount(d: FinanceDB = db, role = "bookkeeper"): Promise<number> {
  const sent = ((await d.meta.get(SENT))?.value as Record<string, string>) ?? {};
  const canWrite = new Set(WRITABLE[role] ?? []);
  let n = 0;
  for (const c of COLLECTIONS.filter((c) => canWrite.has(c.name))) for (const row of await c.table(d).toArray()) if (sent[`${c.name}|${c.idOf(row)}`] !== fingerprint(row)) n++;
  return n;
}
