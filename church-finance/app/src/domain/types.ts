// 데이터 모델 — docs/05-DB설계.md 와 같은 구조 (1단계에 필요한 표만)

export type FundCode = "G" | "S" | "M";

/** 모든 행의 공통 칸 (동기화용) */
export interface Row {
  id: string;
  updatedAt: number; // 기기 시각(ms). 서버 연결 후에는 서버 시각으로 덮어씀
  deleted?: boolean;
  dirty?: 0 | 1; // 1 = 아직 클라우드로 안 보냄
}

export interface IncomeCategory {
  code: string;
  fund: FundCode;
  group: string; // 대분류 (일반헌금, 기타헌금, 절기헌금 …)
  line: string; // 예산·요약표 한 줄의 코드 (감사헌금 3종은 모두 G-THANKS)
  lineName: string;
  name: string;
  named: boolean; // 헌금자 이름을 기록하는가 (주일헌금은 false)
  needsNote: boolean; // 내용(감사 제목 등)을 적는가
  active: boolean;
  sort: number;
}

export interface Household extends Row {
  name: string; // 표시 이름 (예: "홍길동 가정")
  receiptMemberId?: string; // 기부금영수증 신청자
  needsReview?: string; // 엑셀 가져오기에서 자동으로 판단하지 못한 이유 (사람이 확인하면 지움)
}

export interface Member extends Row {
  householdId: string;
  name: string;
  tag?: string; // 동명이인 구분 (A, B …)
  isAnonymous?: boolean;
}

/** 헌금 기록에 적히는 표기 → 가정 (예: "홍길동,김영희") */
export interface DonorAlias extends Row {
  text: string;
  householdId: string;
}

export type PayMethod = "cash" | "online";

export interface Offering extends Row {
  date: string; // 그 주 주일 (YYYY-MM-DD)
  categoryCode: string;
  householdId?: string; // 이름 없는 헌금(주일헌금·무명)은 비움
  donorText: string; // 화면·보고서에 찍히는 이름 표기
  amount: number; // 원
  method: PayMethod;
  note?: string;
  createdAt: number; // 입력 순서 (명세 출력 순서)
  importKey?: string; // 엑셀에서 가져온 기록이면 (같은 파일을 두 번 넣어도 겹치지 않게)
}

// ── 지출 ─────────────────────────────────────────────
export interface ExpenseItem {
  code: string;
  fund: FundCode;
  dept: string; // 부서 코드 (특별·선교 지출은 SPECIAL / MISSION)
  name: string;
  active: boolean;
  sort: number;
  incomeLine?: string; // 특별·선교 지출이면 어느 헌금 잔액에서 빠지는지
}

export interface Expense extends Row {
  date: string; // 그 주 주일 (출납 보고 기준 주)
  itemCode: string;
  amount: number;
  description: string; // 내용
  payee?: string; // 받는 사람 / 비고 (계좌 등) — 기기·클라우드 DB 에만
  source: "fixed" | "manual" | "import";
  fixedRuleId?: string;
  createdAt: number;
  importKey?: string;
}

/** 고정지출 규칙: 매월 몇째 주에 무엇을 얼마 */
export interface FixedRule extends Row {
  weekOfMonth: number; // 1~5
  description: string;
  amount: number;
  itemCode: string;
  payee?: string;
  active: boolean;
  sort: number;
}

/** 해마다 시작 잔액(전년 이월) — 회계별, 특별헌금·선교는 헌금별 */
export interface OpeningBalance {
  year: number;
  key: string; // "G" 또는 수입 줄 코드(S-NEIGHBOR …, M-MISSION …)
  amount: number;
}

export interface Budget {
  year: number;
  code: string; // 수입: 요약표 줄 코드(IncomeCategory.line)
  amount: number;
}
