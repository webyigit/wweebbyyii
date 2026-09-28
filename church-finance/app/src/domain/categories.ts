import type { IncomeCategory } from "./types";

// 수입 과목 — docs/04-계정과목표.md §2. 처음 실행할 때 DB 에 넣는 기본값.
// 순서(sort)는 주일헌금현황 출력 순서와 같게.
const rows: [string, IncomeCategory["fund"], string, string, boolean, boolean][] = [
  ["G-TITHE", "G", "일반헌금", "십일조", true, false],
  ["G-SUNDAY", "G", "일반헌금", "주일헌금", false, false],
  ["G-THANKS-BEOMSA", "G", "감사헌금", "범사감사", true, false],
  ["G-THANKS-ETC", "G", "감사헌금", "기타감사", true, true],
  ["G-THANKS-1000", "G", "감사헌금", "일천번제", true, false],
  ["G-NEWYEAR", "G", "기타헌금", "신년감사", true, false],
  ["G-DEPT", "G", "기타헌금", "기관헌금", true, false],
  ["G-EASTER", "G", "절기헌금", "부활절", true, false],
  ["G-HARVEST1", "G", "절기헌금", "맥추감사절", true, false],
  ["G-HARVEST2", "G", "절기헌금", "추수감사절", true, false],
  ["G-XMAS", "G", "절기헌금", "성탄절", true, false],
  ["S-NEIGHBOR", "S", "특별헌금", "이웃사랑헌금", true, false],
  ["S-FLOWER", "S", "특별헌금", "꽃꽂이헌금", true, true],
  ["S-BUILD", "S", "특별헌금", "건축(E/V)헌금", true, true],
  ["M-MISSION", "M", "선교헌금", "해외선교헌금", true, false],
];

export const DEFAULT_CATEGORIES: IncomeCategory[] = rows.map(([code, fund, group, name, named, needsNote], i) => ({
  code, fund, group, name, named, needsNote, active: true, sort: i,
}));

export const FUND_NAME: Record<IncomeCategory["fund"], string> = {
  G: "일반회계",
  S: "특별회계",
  M: "해외선교",
};
