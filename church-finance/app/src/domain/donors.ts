// 헌금자 찾기 — 입력을 줄이는 핵심.
// "홍길" 처럼 앞글자, "ㅎㄱㄷ" 처럼 초성, "홍길동,김영희" 같은 예전 표기(별칭) 모두로 가정을 찾는다.
import type { DonorAlias, Household, Member, Offering } from "./types";

const CHO = "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ";

export function chosung(s: string): string {
  let out = "";
  for (const ch of s) {
    const c = ch.charCodeAt(0) - 0xac00;
    out += c >= 0 && c < 11172 ? CHO[Math.floor(c / 588)] : ch;
  }
  return out;
}

const norm = (s: string) => s.replace(/[\s,·.]/g, "").toLowerCase();
const isAllCho = (s: string) => s.length > 0 && [...s].every((ch) => CHO.includes(ch));

export interface DonorHit {
  householdId: string;
  label: string; // 보고서에 찍힐 이름 표기
  score: number;
}

/** 가정별 대표 표기: 가장 최근 헌금에 쓴 표기 → 없으면 구성원 이름을 쉼표로 */
export function householdLabel(h: Household, members: Member[], recent?: string): string {
  if (recent) return recent;
  const ms = members.filter((m) => m.householdId === h.id && !m.deleted);
  return ms.length ? ms.map((m) => m.name + (m.tag ?? "")).join(",") : h.name;
}

export function searchDonors(
  query: string,
  households: Household[],
  members: Member[],
  aliases: DonorAlias[],
  offerings: Offering[],
  limit = 8,
): DonorHit[] {
  const q = norm(query);
  if (!q) return [];
  const cho = isAllCho(q);
  const lastText = new Map<string, { text: string; at: number }>();
  for (const o of offerings) {
    if (!o.householdId || o.deleted) continue;
    const prev = lastText.get(o.householdId);
    if (!prev || o.createdAt > prev.at) lastText.set(o.householdId, { text: o.donorText, at: o.createdAt });
  }

  const best = new Map<string, number>();
  const consider = (hid: string, text: string) => {
    const t = norm(cho ? chosung(text) : text);
    let score = 0;
    if (t === q) score = 100;
    else if (t.startsWith(q)) score = 80;
    else if (t.includes(q)) score = 50;
    if (score > (best.get(hid) ?? 0)) best.set(hid, score);
  };

  for (const m of members) if (!m.deleted) consider(m.householdId, m.name + (m.tag ?? ""));
  for (const a of aliases) if (!a.deleted) consider(a.householdId, a.text);
  for (const h of households) if (!h.deleted) consider(h.id, h.name);

  const byId = new Map(households.map((h) => [h.id, h]));
  return [...best.entries()]
    .filter(([id, s]) => s > 0 && byId.get(id) && !byId.get(id)!.deleted)
    .map(([id, score]) => ({
      householdId: id,
      label: householdLabel(byId.get(id)!, members, lastText.get(id)?.text),
      // 최근에 헌금한 가정을 조금 위로
      score: score + (lastText.has(id) ? 5 : 0),
    }))
    .sort((a, b) => b.score - a.score || a.label.localeCompare(b.label, "ko"))
    .slice(0, limit);
}

/** 지난 헌금 명단 불러오기: 이 과목에 가장 최근 주일에 헌금한 사람들과 금액 (이번 주 이미 입력한 가정은 제외) */
export function previousRoster(categoryCode: string, date: string, offerings: Offering[]) {
  const past = offerings.filter((o) => !o.deleted && o.categoryCode === categoryCode && o.date < date && o.householdId);
  if (!past.length) return [];
  const lastDate = past.reduce((m, o) => (o.date > m ? o.date : m), "");
  const done = new Set(offerings.filter((o) => !o.deleted && o.categoryCode === categoryCode && o.date === date).map((o) => o.householdId));
  // 같은 가정이 그 주에 여러 번 냈으면 한 줄로 합친다 (한 번 누르면 합계로 추가)
  const rows = new Map<string, { householdId: string; donorText: string; amount: number; method: Offering["method"]; fromDate: string }>();
  for (const o of past.filter((o) => o.date === lastDate && !done.has(o.householdId)).sort((a, b) => a.createdAt - b.createdAt)) {
    const r = rows.get(o.householdId!);
    if (r) r.amount += o.amount;
    else rows.set(o.householdId!, { householdId: o.householdId!, donorText: o.donorText, amount: o.amount, method: o.method, fromDate: lastDate });
  }
  return [...rows.values()];
}
