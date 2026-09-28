import { db, newId, softDelete, touch, type FinanceDB } from "./db";
import type { Expense, FixedRule } from "../domain/types";

export async function addExpense(e: Omit<Expense, "id" | "updatedAt" | "createdAt">, d: FinanceDB = db) {
  const row: Expense = touch({ id: newId(), updatedAt: 0, createdAt: Date.now(), ...e });
  await d.expenses.put(row);
  return row;
}

export const deleteExpense = (id: string, d: FinanceDB = db) => softDelete(d.expenses as never, id);

/** 이번 주 고정지출을 한 번에 추가 (이미 추가된 규칙은 건너뜀) */
export async function addFixedForWeek(date: string, rules: FixedRule[], d: FinanceDB = db) {
  const done = new Set((await d.expenses.where("date").equals(date).toArray()).filter((e) => !e.deleted && e.fixedRuleId).map((e) => e.fixedRuleId));
  const base = Date.now();
  const rows = rules.filter((r) => !done.has(r.id)).map((r, i) =>
    touch<Expense>({ id: newId(), updatedAt: 0, createdAt: base + i, date, itemCode: r.itemCode, amount: r.amount, description: r.description, payee: r.payee, source: "fixed", fixedRuleId: r.id }),
  );
  await d.expenses.bulkPut(rows);
  return rows.length;
}

export async function saveRule(r: Partial<FixedRule> & Pick<FixedRule, "weekOfMonth" | "description" | "amount" | "itemCode">, d: FinanceDB = db) {
  const row: FixedRule = touch({ id: r.id ?? newId(), updatedAt: 0, active: true, sort: Date.now(), ...r } as FixedRule);
  await d.fixedRules.put(row);
}
export const deleteRule = (id: string, d: FinanceDB = db) => softDelete(d.fixedRules as never, id);

/** 출납 파일 가져오기: 지출(중복 없이) · 예산 · 고정지출 규칙(같은 주·내용은 건너뜀) · 전년 이월 */
export async function applyCashierImport(
  ci: import("../domain/importCashier").CashierImport,
  year: number,
  d: FinanceDB = db,
) {
  const { expenseImportKeys } = await import("../domain/importCashier");
  const keys = expenseImportKeys(ci.expenses);
  const have = new Set((await d.expenses.toArray()).filter((e) => !e.deleted && e.importKey).map((e) => e.importKey));
  const base = Date.now();
  const newExpenses = ci.expenses
    .map((e, i) => ({ e, key: keys[i], i }))
    .filter((x) => !have.has(x.key))
    .map(({ e, key, i }) => touch<Expense>({ id: newId(), updatedAt: 0, createdAt: base + i, date: e.date, itemCode: e.itemCode, amount: e.amount, description: e.description, payee: e.payee, source: "import", importKey: key }));
  const rules = await d.fixedRules.toArray();
  const ruleKey = (r: { weekOfMonth: number; description: string }) => `${r.weekOfMonth}|${r.description.replace(/\s/g, "")}`;
  const haveRules = new Set(rules.filter((r) => !r.deleted).map(ruleKey));
  const newRules = ci.rules.filter((r) => !haveRules.has(ruleKey(r))).map((r, i) => touch<FixedRule>({ id: newId(), updatedAt: 0, active: true, sort: i, ...r }));
  await d.transaction("rw", [d.expenses, d.fixedRules, d.budgets, d.openings], async () => {
    await d.expenses.bulkPut(newExpenses);
    await d.fixedRules.bulkPut(newRules);
    await d.budgets.bulkPut(ci.budgets.map((b) => ({ year, ...b })));
    await d.openings.bulkPut(ci.openings.map((o) => ({ year, ...o })));
  });
  return { expenses: newExpenses.length, skipped: ci.expenses.length - newExpenses.length, rules: newRules.length, budgets: ci.budgets.length, openings: ci.openings.length };
}
