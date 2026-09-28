// 엑셀 '개인별 헌금집계'(월별 시트: 일자 | 구분 | 성명 | 금액 | 비고) → 앱의 헌금 기록.
// 순수 함수만 둔다 (브라우저·테스트·검증 스크립트가 같이 씀). 파일 읽기는 readWorkbook.ts.
import { sundayOf } from "./dates";
import type { DonorAlias, Household, Member, Offering } from "./types";

export interface SheetRow {
  sheet: string;
  row: number; // 엑셀 행 번호 (오류 안내용)
  date: string; // YYYY-MM-DD
  label: string; // 구분 원문
  name: string; // 성명 원문
  amount: number;
  note?: string;
}

// ── 구분(과목) ────────────────────────────────────────────────
// 엑셀에는 같은 과목이 여러 표기로 적혀 있다: '꽃꽃이', '꽃꽂이 헌금', '해외선교헌금헌금', '해외선선교', '감사헌금-범사' …
const LABELS: Record<string, string> = {
  십일조: "G-TITHE",
  주일: "G-SUNDAY",
  범사감사: "G-THANKS-BEOMSA", "감사-범사": "G-THANKS-BEOMSA", 범사: "G-THANKS-BEOMSA",
  기타감사: "G-THANKS-ETC", "감사-기타": "G-THANKS-ETC",
  일천번제: "G-THANKS-1000",
  감사: "G-THANKS-GEN",
  신년감사: "G-NEWYEAR", 신년: "G-NEWYEAR",
  기관: "G-DEPT",
  부활절: "G-EASTER",
  맥추감사절: "G-HARVEST1", 맥추감사: "G-HARVEST1", 맥추: "G-HARVEST1",
  추수감사절: "G-HARVEST2", 추수감사: "G-HARVEST2", 추수: "G-HARVEST2",
  성탄절: "G-XMAS", 성탄: "G-XMAS",
  이웃사랑: "S-NEIGHBOR",
  꽃꽂이: "S-FLOWER",
  "건축(E/V)": "S-BUILD", 건축: "S-BUILD",
  해외선교: "M-MISSION",
};

export function normalizeLabel(label: string): string {
  return label.replace(/\s/g, "").replace(/헌금/g, "").replace(/꽃꽃이/g, "꽃꽂이").replace(/선선교/g, "선교");
}

export function mapCategory(label: string): string | null {
  return LABELS[normalizeLabel(label)] ?? null;
}

// ── 성명 → 가정 ───────────────────────────────────────────────
export const isAnonymous = (name: string) => /^무명\s*\d*$/.test(name.trim());

/** "홍길동, 김영희" "홍길동.김영희" → ["홍길동","김영희"]. 괄호 설명은 이름에서 뗀다: "홍길동(아들)" → "홍길동" */
export function splitNames(text: string): string[] {
  return text
    .replace(/[([][^)\]]*[)\]]/g, "")
    .split(/[,.·/]/)
    .map((s) => s.trim().replace(/\s+/g, ""))
    .filter(Boolean);
}

/** 보고서·명단에 찍을 표기: 쉼표 뒤 공백 정리 */
export const cleanText = (text: string) => text.trim().replace(/\s*,\s*/g, ",");

export interface PlannedHousehold {
  key: string; // 계획 안에서 쓰는 임시 키
  existingId?: string; // 이미 앱에 있는 가정이면
  names: string[];
  texts: Set<string>; // 이 가정으로 모인 원문 표기들 (별칭으로 저장)
  needsReview?: string; // 확인이 필요한 이유
}

export interface PlannedOffering {
  src: SheetRow;
  categoryCode: string;
  householdKey?: string;
  donorText: string;
  importKey: string;
}

export interface ImportPlan {
  offerings: PlannedOffering[];
  households: PlannedHousehold[];
  unknownLabels: { label: string; count: number; rows: string[] }[];
  badRows: { where: string; why: string }[];
  duplicates: number; // 이미 들어와 있어서 건너뛴 건수
  bySheet: { sheet: string; count: number; sum: number }[];
}

const key = (names: string[]) => [...names].sort().join("|");
const isSubset = (a: string[], b: string[]) => a.every((x) => b.includes(x));

export function planImport(
  rows: SheetRow[],
  existing: { households: Household[]; members: Member[]; aliases: DonorAlias[]; offerings: Offering[] },
): ImportPlan {
  const badRows: ImportPlan["badRows"] = [];
  const unknown = new Map<string, { count: number; rows: string[] }>();
  const good: (SheetRow & { code: string })[] = [];

  for (const r of rows) {
    const where = `${r.sheet} ${r.row}행`;
    if (!r.date || !/^\d{4}-\d{2}-\d{2}$/.test(r.date)) { badRows.push({ where, why: "날짜를 읽을 수 없음" }); continue; }
    if (!Number.isFinite(r.amount) || r.amount <= 0) { badRows.push({ where, why: "금액이 없거나 0 이하" }); continue; }
    const code = mapCategory(r.label);
    if (!code) {
      const u = unknown.get(r.label) ?? { count: 0, rows: [] };
      u.count++; if (u.rows.length < 5) u.rows.push(where);
      unknown.set(r.label, u);
      continue;
    }
    good.push({ ...r, code });
  }

  // 1) 이미 앱에 있는 가정
  const hh: PlannedHousehold[] = existing.households.filter((h) => !h.deleted).map((h) => ({
    key: h.id, existingId: h.id,
    names: existing.members.filter((m) => m.householdId === h.id && !m.deleted).map((m) => m.name + (m.tag ?? "")),
    texts: new Set(existing.aliases.filter((a) => a.householdId === h.id && !a.deleted).map((a) => cleanText(a.text))),
  }));
  const byText = new Map<string, PlannedHousehold>();
  for (const h of hh) for (const t of h.texts) byText.set(t, h);

  // 2) 여러 이름 표기부터 가정으로 묶는다 (이름이 많은 것부터 → "a,b,c" 가 먼저 생기고 "a,b" 는 거기에 붙음)
  const texts = [...new Set(good.filter((r) => r.name && !isAnonymous(r.name)).map((r) => cleanText(r.name)))];
  const multi = texts.filter((t) => splitNames(t).length > 1).sort((a, b) => splitNames(b).length - splitNames(a).length);
  let seq = 0;
  for (const t of multi) {
    if (byText.has(t)) continue;
    const names = splitNames(t);
    const same = hh.find((h) => key(h.names) === key(names)) ?? hh.find((h) => h.names.length > 1 && isSubset(names, h.names));
    if (same) { same.texts.add(t); byText.set(t, same); continue; }
    const h: PlannedHousehold = { key: `new${++seq}`, names, texts: new Set([t]) };
    hh.push(h); byText.set(t, h);
  }

  // 3) 한 사람 이름: 그 이름이 들어 있는 가정이 딱 하나면 거기로, 없으면 새 가정, 여럿이면 새 가정 + 확인 필요
  for (const t of texts.filter((t) => splitNames(t).length === 1)) {
    if (byText.has(t)) continue;
    const [name] = splitNames(t);
    const owners = hh.filter((h) => h.names.includes(name));
    if (owners.length === 1) { owners[0].texts.add(t); byText.set(t, owners[0]); continue; }
    const h: PlannedHousehold = { key: `new${++seq}`, names: [name], texts: new Set([t]) };
    if (owners.length > 1) h.needsReview = `'${name}' 이(가) 여러 가정에 있음: 어느 가정인지 확인`;
    hh.push(h); byText.set(t, h);
  }

  // 4) 헌금 기록. 같은 파일을 두 번 넣어도 겹치지 않도록 내용으로 키를 만든다 (같은 내용이 여러 번이면 순번)
  const seen = new Map<string, number>();
  const already = new Set(existing.offerings.filter((o) => !o.deleted && o.importKey).map((o) => o.importKey!));
  let duplicates = 0;
  const offerings: PlannedOffering[] = [];
  for (const r of good) {
    const text = cleanText(r.name ?? "");
    const base = `${r.date}|${r.code}|${text}|${r.amount}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    const importKey = `${base}|${n}`;
    if (already.has(importKey)) { duplicates++; continue; }
    const h = text && !isAnonymous(text) ? byText.get(text) : undefined;
    offerings.push({ src: r, categoryCode: r.code, householdKey: h?.key, donorText: text, importKey });
  }

  const bySheet = new Map<string, { count: number; sum: number }>();
  for (const r of rows) {
    const s = bySheet.get(r.sheet) ?? { count: 0, sum: 0 };
    s.count++; s.sum += Number.isFinite(r.amount) ? r.amount : 0;
    bySheet.set(r.sheet, s);
  }

  const used = new Set(offerings.map((o) => o.householdKey));
  return {
    offerings,
    households: hh.filter((h) => !h.existingId && used.has(h.key)).concat(hh.filter((h) => h.existingId && used.has(h.key))),
    unknownLabels: [...unknown.entries()].map(([label, v]) => ({ label, ...v })),
    badRows,
    duplicates,
    bySheet: [...bySheet.entries()].map(([sheet, v]) => ({ sheet, ...v })),
  };
}

/** 헌금 날짜: 엑셀에 평일 날짜가 있으면 그 주 주일로 모은다 */
export const offeringDate = (ymd: string) => sundayOf(ymd);
