// 기기 안 데이터베이스 (IndexedDB). 인터넷이 없어도 여기에 먼저 저장되고,
// 클라우드 동기화(sync.ts)가 dirty=1 인 행을 올려 보낸다.
import Dexie, { type Table } from "dexie";
import { DEFAULT_CATEGORIES } from "../domain/categories";
import type { Applicant, Budget, DonorAlias, Receipt, Expense, ExpenseItem, FixedRule, Household, IncomeCategory, Member, Offering, OpeningBalance, Row } from "../domain/types";
import { DEFAULT_EXPENSE_ITEMS } from "../domain/expenseCategories";
import type { BankTxn } from "../domain/bank";

export class FinanceDB extends Dexie {
  categories!: Table<IncomeCategory, string>;
  households!: Table<Household, string>;
  members!: Table<Member, string>;
  aliases!: Table<DonorAlias, string>;
  offerings!: Table<Offering, string>;
  budgets!: Table<Budget, [number, string]>;
  meta!: Table<{ key: string; value: unknown }, string>;
  expenseItems!: Table<ExpenseItem, string>;
  expenses!: Table<Expense, string>;
  fixedRules!: Table<FixedRule, string>;
  openings!: Table<OpeningBalance, [number, string]>;
  bankTxns!: Table<BankTxn & { appliedAs?: string }, string>;
  bankRules!: Table<{ content: string; itemCode: string }, string>;
  applicants!: Table<Applicant, string>;
  receipts!: Table<Receipt, string>;
  settings!: Table<{ key: string; value: unknown }, string>;

  constructor(name = "church-finance") {
    super(name);
    this.version(1).stores({
      categories: "code, sort",
      households: "id, name, dirty",
      members: "id, householdId, name, dirty",
      aliases: "id, householdId, text, dirty",
      offerings: "id, date, categoryCode, householdId, [date+categoryCode], dirty",
      budgets: "[year+code], year",
      meta: "key",
    });
    // 2판: 지출 (3단계)
    this.version(2).stores({
      expenseItems: "code, dept, sort",
      expenses: "id, date, itemCode, dirty",
      fixedRules: "id, weekOfMonth, dirty",
      openings: "[year+key], year",
    });
    // 3판: 통장 거래내역 (중복 방지) + 출금 분류 규칙 (거래내용 → 지출 항목)
    this.version(3).stores({
      bankTxns: "key, sunday",
      bankRules: "content",
    });
    // 4판: 기부금영수증 (신청자·발급대장) + 기기끼리 맞추는 설정(교회 정보, 주민번호 금고 공개 열쇠)
    this.version(4).stores({
      applicants: "id, name, dirty",
      receipts: "id, year, serial, applicantId, dirty",
      settings: "key",
    });
  }
}

export const db = new FinanceDB();

/** 기본 과목을 넣는다. 이미 있는 과목은 담당자가 바꾼 이름·사용여부는 두고 구조(줄·순서)만 맞춘다. */
export async function ensureSeed(d: FinanceDB = db) {
  const have = new Map((await d.categories.toArray()).map((c) => [c.code, c]));
  await d.categories.bulkPut(
    DEFAULT_CATEGORIES.map((c) => {
      const old = have.get(c.code);
      return old ? { ...c, name: old.name, active: old.active } : c;
    }),
  );
  const items = new Map((await d.expenseItems.toArray()).map((c) => [c.code, c]));
  await d.expenseItems.bulkPut(DEFAULT_EXPENSE_ITEMS.map((c) => {
    const old = items.get(c.code);
    return old ? { ...c, name: old.name, active: old.active } : c;
  }));
}

export const newId = () =>
  (globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`);

/** 저장할 때마다 수정 시각과 '보낼 목록' 표시를 붙인다 */
export function touch<T extends Row>(row: T): T {
  return { ...row, updatedAt: Date.now(), dirty: 1 };
}

export async function softDelete(table: Table<Row, string>, id: string) {
  const row = await table.get(id);
  if (row) await table.put(touch({ ...row, deleted: true }));
}
