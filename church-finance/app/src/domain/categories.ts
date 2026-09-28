import type { IncomeCategory } from "./types";

// 수입 과목 — docs/04-계정과목표.md §2. 처음 실행할 때 DB 에 넣는 기본값.
// line = 예산·요약표의 한 줄. 감사헌금은 예산이 한 줄이고 그 아래 범사/기타/일천번제 명단이 따로 나온다 (엑셀과 같게).
// 순서(sort)는 주일헌금현황 출력 순서와 같게.
type R = [code: string, fund: IncomeCategory["fund"], group: string, line: string, lineName: string, name: string, named: boolean, needsNote: boolean, active?: boolean];
const rows: R[] = [
  ["G-TITHE", "G", "일반헌금", "G-TITHE", "십일조", "십일조", true, false],
  ["G-SUNDAY", "G", "일반헌금", "G-SUNDAY", "주일헌금", "주일헌금", false, false],
  ["G-THANKS-BEOMSA", "G", "일반헌금", "G-THANKS", "감사헌금", "범사감사", true, false],
  ["G-THANKS-ETC", "G", "일반헌금", "G-THANKS", "감사헌금", "기타감사", true, true],
  ["G-THANKS-1000", "G", "일반헌금", "G-THANKS", "감사헌금", "일천번제", true, false],
  // 세부 구분 없이 '감사헌금' 으로만 적힌 예전 기록용 (입력 화면에는 안 나옴)
  ["G-THANKS-GEN", "G", "일반헌금", "G-THANKS", "감사헌금", "감사헌금(구분없음)", true, false, false],
  ["G-NEWYEAR", "G", "기타헌금", "G-NEWYEAR", "신년감사", "신년감사", true, false],
  ["G-DEPT", "G", "기타헌금", "G-DEPT", "기관헌금", "기관헌금", true, false],
  ["G-EASTER", "G", "절기헌금", "G-EASTER", "부활절", "부활절", true, false],
  ["G-HARVEST1", "G", "절기헌금", "G-HARVEST1", "맥추감사절", "맥추감사절", true, false],
  ["G-HARVEST2", "G", "절기헌금", "G-HARVEST2", "추수감사절", "추수감사절", true, false],
  ["G-XMAS", "G", "절기헌금", "G-XMAS", "성탄절", "성탄절", true, false],
  // 헌금 아닌 일반회계 수입 (예: 2025년 보험금 수령). 입력 화면에는 안 나옴
  ["G-OTHER", "G", "기타헌금", "G-OTHER", "기타수입", "기타수입", false, true, false],
  ["S-NEIGHBOR", "S", "특별헌금", "S-NEIGHBOR", "이웃사랑헌금", "이웃사랑헌금", true, false],
  ["S-FLOWER", "S", "특별헌금", "S-FLOWER", "꽃꽂이헌금", "꽃꽂이헌금", true, true],
  ["S-BUILD", "S", "특별헌금", "S-BUILD", "건축(E/V)헌금", "건축(E/V)헌금", true, true],
  // 2025년에만 있던 특별 항목 (다른 회계로 옮겨지며 없어짐). 입력 화면에는 안 나옴
  ["S-WISH", "S", "특별헌금", "S-WISH", "소원예물", "소원예물", true, false, false],
  ["S-INSURANCE", "S", "특별헌금", "S-INSURANCE", "보험금수령(특별)", "보험금수령(특별)", false, false, false],
  ["M-MISSION", "M", "선교헌금", "M-MISSION", "해외선교헌금", "해외선교헌금", true, false],
  // 한시 구호헌금 (예: 네팔 긴급구호). 필요할 때 이름을 바꿔 씀
  ["M-RELIEF", "M", "선교헌금", "M-RELIEF", "긴급구호헌금", "긴급구호헌금", true, false],
];

export const DEFAULT_CATEGORIES: IncomeCategory[] = rows.map(([code, fund, group, line, lineName, name, named, needsNote, active = true], i) => ({
  code, fund, group, line, lineName, name, named, needsNote, active, sort: i,
}));

export const FUND_NAME: Record<IncomeCategory["fund"], string> = {
  G: "일반회계",
  S: "특별회계",
  M: "해외선교",
};
