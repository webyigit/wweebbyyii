// 기기 안 데이터베이스 (IndexedDB). 인터넷이 없어도 여기에 먼저 저장되고,
// 클라우드 동기화(sync.ts)가 dirty=1 인 행을 올려 보낸다.
import Dexie, { type Table } from "dexie";
import { DEFAULT_CATEGORIES } from "../domain/categories";
import type { Budget, DonorAlias, Household, IncomeCategory, Member, Offering, Row } from "../domain/types";

export class FinanceDB extends Dexie {
  categories!: Table<IncomeCategory, string>;
  households!: Table<Household, string>;
  members!: Table<Member, string>;
  aliases!: Table<DonorAlias, string>;
  offerings!: Table<Offering, string>;
  budgets!: Table<Budget, [number, string]>;
  meta!: Table<{ key: string; value: unknown }, string>;

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
  }
}

export const db = new FinanceDB();

export async function ensureSeed(d: FinanceDB = db) {
  if ((await d.categories.count()) === 0) await d.categories.bulkAdd(DEFAULT_CATEGORIES);
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
