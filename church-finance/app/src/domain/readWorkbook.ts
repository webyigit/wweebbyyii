// 엑셀 파일 → SheetRow[]. 머리글 이름(일자·구분·성명·금액·비고)으로 열을 찾으므로 열 위치가 바뀌어도 읽는다.
import * as XLSX from "xlsx";
import type { SheetRow } from "./importOfferings";

const pad = (n: number) => String(n).padStart(2, "0");

function toYmd(v: unknown): string {
  if (v instanceof Date && !isNaN(v.getTime())) {
    // SheetJS 는 날짜를 UTC 자정 근처로 준다 → 12시간 더해 날짜가 하루 밀리지 않게
    const d = new Date(v.getTime() + 12 * 3600 * 1000);
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  }
  if (typeof v === "number" && v > 20000 && v < 80000) {
    const p = XLSX.SSF.parse_date_code(v);
    return `${p.y}-${pad(p.m)}-${pad(p.d)}`;
  }
  if (typeof v === "string") {
    const m = v.trim().match(/^(\d{4})[-./]\s*(\d{1,2})[-./]\s*(\d{1,2})/);
    if (m) return `${m[1]}-${pad(+m[2])}-${pad(+m[3])}`;
  }
  return "";
}

function toAmount(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") return Number(v.replace(/[,\s원]/g, "")) || NaN;
  return NaN;
}

export interface ReadResult {
  rows: SheetRow[];
  sheets: { name: string; rows: number; headerTotal?: number }[]; // headerTotal: 시트 머리에 적힌 합계 (대조용)
}

export function readOfferingWorkbook(data: ArrayBuffer | Uint8Array): ReadResult {
  const wb = XLSX.read(data, { type: "array", cellDates: true });
  const rows: SheetRow[] = [];
  const sheets: ReadResult["sheets"] = [];

  for (const name of wb.SheetNames) {
    const grid = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, raw: true, defval: null, blankrows: true });
    const h = grid.findIndex((r) => Array.isArray(r) && r.some((c) => String(c ?? "").trim() === "일자"));
    if (h < 0) continue;
    const head = grid[h].map((c) => String(c ?? "").replace(/\s/g, ""));
    const col = (label: string) => head.indexOf(label);
    const [cDate, cLabel, cName, cAmount, cNote] = ["일자", "구분", "성명", "금액", "비고"].map(col);
    if ([cDate, cLabel, cName, cAmount].some((c) => c < 0)) continue;

    // 머리글 바로 위 줄에 적힌 시트 합계 (엑셀의 E4 같은 칸)
    const above = h > 0 ? grid[h - 1]?.[cAmount] : undefined;
    const headerTotal = typeof above === "number" ? above : undefined;

    let n = 0;
    for (let i = h + 1; i < grid.length; i++) {
      const r = grid[i];
      if (!r || r[cDate] == null || r[cDate] === "") continue;
      rows.push({
        sheet: name,
        row: i + 1,
        date: toYmd(r[cDate]),
        label: String(r[cLabel] ?? "").trim(),
        name: String(r[cName] ?? "").trim(),
        amount: toAmount(r[cAmount]),
        note: cNote >= 0 && r[cNote] != null && String(r[cNote]).trim() ? String(r[cNote]).trim() : undefined,
      });
      n++;
    }
    sheets.push({ name, rows: n, headerTotal });
  }
  return { rows, sheets };
}
