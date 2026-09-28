// 병행 운영: 그 주 엑셀 출납 파일의 `MM-DD` 시트(주간 수입/지출)와 앱이 계산한 주간 보고를 칸마다 비교.
// 아무것도 저장하지 않는다. 몇 주 동안 모두 ✔ 이면 엑셀을 그만 써도 된다는 근거가 된다.
import * as XLSX from "xlsx";
import type { CashbookWeek, Flow } from "./cashbookReport";

export interface WeekSheet { sheet: string; date: string; rows: { label: string; flow: Flow }[] }
const ns = (v: unknown) => String(v ?? "").replace(/\s/g, "");

/** 파일에서 가장 최근 주 시트(이름 'MM-DD')를 읽음 */
export function readWeekSheet(data: ArrayBuffer | Uint8Array): WeekSheet | null {
  const wb = XLSX.read(data, { type: "array", cellDates: true });
  const names = wb.SheetNames.filter((n) => /^\d{2}-\d{2}$/.test(n.trim())).sort();
  const sheet = names[names.length - 1];
  if (!sheet) return null;
  const g = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheet], { header: 1, raw: true, defval: null });
  const dateCell = g.slice(0, 8).flat().map((c) => (c instanceof Date ? c.toISOString().slice(0, 10) : String(c ?? ""))).find((c) => /^\d{4}-\d{2}-\d{2}/.test(c));
  const date = dateCell ? dateCell.slice(0, 10) : "";
  const rows: WeekSheet["rows"] = [];
  for (const r of g) {
    const i = r.findIndex((c) => typeof c === "string" && ns(c));
    if (i < 0) continue;
    const nums = r.slice(i + 1).filter((c) => typeof c === "number") as number[];
    if (nums.length < 4) continue;
    const label = ns(r[i]);
    if (rows.some((x) => x.label === label)) continue;
    rows.push({ label, flow: { opening: nums[0], income: nums[1], expense: nums[2], closing: nums[3] } });
  }
  return { sheet, date, rows };
}

export interface CompareRow { label: string; field: "지난주 잔액" | "수입" | "지출" | "잔액"; excel: number; app: number; ok: boolean }

/** 앱 주간 보고의 줄 이름 ↔ 엑셀 줄 이름 */
export function compareWeek(ws: WeekSheet, w: CashbookWeek): CompareRow[] {
  const key = (s: string) => ns(s).replace(/꽃꽃이/g, "꽃꽂이"); // 엑셀에 '꽃꽃이'로도 적힘
  const app = new Map<string, Flow>([["일반헌금", w.general], ["특별헌금", w.special], ["합계", w.total]]);
  for (const p of w.specialPots) app.set(key(p.name), p);
  const out: CompareRow[] = [];
  for (const { label, flow } of ws.rows) {
    const mine = app.get(key(label));
    if (!mine) continue;
    for (const [field, k] of [["지난주 잔액", "opening"], ["수입", "income"], ["지출", "expense"], ["잔액", "closing"]] as const) {
      out.push({ label, field, excel: flow[k], app: mine[k], ok: flow[k] === mine[k] });
    }
  }
  return out;
}
