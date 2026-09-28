// 전체 백업·되살리기, 사람이 읽는 엑셀 내보내기.
// 엑셀을 그만 쓰더라도 언제든 파일 한 개로 모든 기록을 보관·이전할 수 있게 한다.
import * as XLSX from "xlsx";
import { db, type FinanceDB } from "./db";

export interface Backup { app: "church-finance"; version: 1; at: string; tables: Record<string, unknown[]> }

const LOCAL_ONLY = /^sync:/; // 기기마다 다른 동기화 표시는 백업에 넣지 않음

export async function makeBackup(d: FinanceDB = db): Promise<Backup> {
  const tables: Record<string, unknown[]> = {};
  for (const t of d.tables) {
    const rows = await t.toArray();
    tables[t.name] = t.name === "meta" ? rows.filter((r) => !LOCAL_ONLY.test(String((r as { key: string }).key))) : rows;
  }
  return { app: "church-finance", version: 1, at: new Date().toISOString(), tables };
}

export function summarize(b: Backup): { name: string; rows: number }[] {
  return Object.entries(b.tables).map(([name, rows]) => ({ name, rows: rows.length })).filter((x) => x.rows > 0);
}

export function parseBackup(text: string): Backup {
  let b: Backup;
  try { b = JSON.parse(text); } catch { throw new Error("백업 파일이 아닙니다 (읽을 수 없음)"); }
  if (b?.app !== "church-finance" || b.version !== 1 || typeof b.tables !== "object") throw new Error("교회 재정관리 백업 파일이 아닙니다");
  return b;
}

/**
 * 백업으로 되돌림: 지금 기기의 기록을 모두 지우고 백업 내용으로 채운다.
 * 로그인해 있으면 되살린 기록 전부를 다시 올린다 (다른 기기에도 퍼짐).
 */
export async function restoreBackup(b: Backup, d: FinanceDB = db): Promise<number> {
  const known = new Set(d.tables.map((t) => t.name));
  let n = 0;
  await d.transaction("rw", d.tables, async () => {
    for (const t of d.tables) {
      if (t.name === "meta") {
        const keep = (await t.toArray()).filter((r) => LOCAL_ONLY.test(String((r as { key: string }).key)) && (r as { key: string }).key !== "sync:sent");
        await t.clear();
        await t.bulkPut(keep);
      } else await t.clear();
    }
    for (const [name, rows] of Object.entries(b.tables)) {
      if (!known.has(name)) continue;
      await d.table(name).bulkPut(rows);
      n += rows.length;
    }
  });
  return n;
}

export async function markBackedUp(d: FinanceDB = db) { await d.meta.put({ key: "backup:lastAt", value: new Date().toISOString() }); }
export async function lastBackupAt(d: FinanceDB = db) { return (await d.meta.get("backup:lastAt"))?.value as string | undefined; }

/** 사람이 읽는 엑셀: 헌금·지출·가정·예산·이월 (감사·보관용) */
export async function exportWorkbook(d: FinanceDB = db): Promise<XLSX.WorkBook> {
  const cats = new Map((await d.categories.toArray()).map((c) => [c.code, c]));
  const items = new Map((await d.expenseItems.toArray()).map((i) => [i.code, i]));
  const hh = new Map((await d.households.toArray()).map((h) => [h.id, h]));
  const members = (await d.members.toArray()).filter((m) => !m.deleted);
  const wb = XLSX.utils.book_new();
  const add = (name: string, rows: (string | number)[][]) => XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name);
  add("헌금", [["주일", "회계", "과목", "이름", "금액", "방법", "비고"], ...(await d.offerings.orderBy("date").toArray()).filter((o) => !o.deleted)
    .map((o) => [o.date, cats.get(o.categoryCode)?.fund ?? "", cats.get(o.categoryCode)?.name ?? o.categoryCode, o.donorText, o.amount, o.method === "online" ? "온라인" : "현금", o.note ?? ""])]);
  add("지출", [["주일", "부서", "항목", "내용", "금액", "받는 곳·비고"], ...(await d.expenses.orderBy("date").toArray()).filter((e) => !e.deleted)
    .map((e) => [e.date, items.get(e.itemCode)?.dept ?? "", items.get(e.itemCode)?.name ?? e.itemCode, e.description, e.amount, e.payee ?? ""])]);
  add("가정·교인", [["가정", "구성원"], ...[...hh.values()].filter((h) => !h.deleted).map((h) => [h.name, members.filter((m) => m.householdId === h.id).map((m) => m.name + (m.tag ?? "")).join(", ")])]);
  add("예산", [["해", "코드", "이름", "금액"], ...(await d.budgets.toArray()).map((b) => [b.year, b.code, cats.get(b.code)?.lineName ?? items.get(b.code)?.name ?? "", b.amount])]);
  add("전년이월", [["해", "회계·헌금", "금액"], ...(await d.openings.toArray()).map((o) => [o.year, o.key, o.amount])]);
  return wb;
}
