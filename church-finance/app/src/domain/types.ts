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
  receiptMemberId?: string; // (예전 칸, 쓰지 않음 — receiptShares 로 바뀜)
  /** 이 가정 헌금을 누구 영수증으로 보내나. 여러 명이면 비율(%)로 나눔. 해마다 그대로 이어짐 */
  receiptShares?: ReceiptShare[];
  needsReview?: string; // 엑셀 가져오기에서 자동으로 판단하지 못한 이유 (사람이 확인하면 지움)
}

// ── 기부금영수증 ─────────────────────────────────────
export interface ReceiptShare { applicantId: string; pct: number }

/** 영수증 신청자 (개인 또는 법인). 해마다 거의 같으므로 한 번 넣으면 계속 씀 */
export interface Applicant extends Row {
  kind: "person" | "corp";
  name: string;
  idSealed?: string; // 개인: 주민등록번호 (금고로 잠금, vault.ts). 원문은 어디에도 저장하지 않음
  idMasked?: string; // 화면용 앞부분만 (예: 751114-2******)
  bizNo?: string; // 법인: 사업자등록번호 (공개 정보라 그대로)
  phone?: string;
  address?: string;
  note?: string;
}

/** 발급한 영수증 한 장. 발급 순간의 내용을 그대로 남긴다 (나중에 헌금·주소가 바뀌어도 재인쇄는 같게) */
export interface Receipt extends Row {
  year: number; // 기부 연도 (2026년 헌금 → 2027년 초에 발급)
  serial: string; // 일련번호 "2027-001" (발급 연도-번호)
  applicantId: string;
  kind: "person" | "corp";
  name: string;
  idSealed?: string;
  idMasked?: string;
  bizNo?: string;
  address?: string;
  months: number[]; // 1~12월 금액
  amount: number;
  issuedAt: string; // YYYY-MM-DD
  status: "issued" | "void";
  voidReason?: string;
  sources?: string[]; // 어느 가정 헌금이 들어갔나 (가정 이름·비율, 확인용)
  imported?: boolean; // 예전 발급대장에서 가져온 기록
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
