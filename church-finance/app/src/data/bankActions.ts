import { db, newId, touch, type FinanceDB } from "./db";
import type { BankTxn } from "../domain/bank";
import type { Expense, Offering } from "../domain/types";

export interface DepositDecision { txn: BankTxn; existingOfferingId?: string; householdId?: string; donorText: string; categoryCode: string }
export interface WithdrawDecision { txn: BankTxn; existingExpenseId?: string; itemCode?: string; description: string }

/** 고른 입금·출금을 반영: 입금 → 온라인 헌금 (이미 있으면 '온라인' 표시만), 출금 → 지출 (분류 규칙 기억) */
export async function applyBank(deposits: DepositDecision[], withdrawals: WithdrawDecision[], d: FinanceDB = db) {
  const base = Date.now();
  let made = 0, linked = 0, expenses = 0;
  await d.transaction("rw", [d.offerings, d.expenses, d.bankTxns, d.bankRules], async () => {
    for (const [i, x] of deposits.entries()) {
      if (x.existingOfferingId) {
        const o = await d.offerings.get(x.existingOfferingId);
        if (o) { await d.offerings.put(touch({ ...o, method: "online" })); linked++; }
      } else {
        await d.offerings.put(touch<Offering>({ id: newId(), updatedAt: 0, createdAt: base + i, date: x.txn.sunday, categoryCode: x.categoryCode, householdId: x.householdId, donorText: x.donorText, amount: x.txn.deposit, method: "online", importKey: `bank|${x.txn.key}` }));
        made++;
      }
      await d.bankTxns.put({ ...x.txn, appliedAs: x.existingOfferingId ? "offering-linked" : "offering" });
    }
    for (const [i, w] of withdrawals.entries()) {
      if (!w.existingExpenseId && w.itemCode) {
        await d.expenses.put(touch<Expense>({ id: newId(), updatedAt: 0, createdAt: base + 1000 + i, date: w.txn.sunday, itemCode: w.itemCode, amount: w.txn.withdraw, description: w.description, payee: "NH농협 출금", source: "import", importKey: `bank|${w.txn.key}` }));
        await d.bankRules.put({ content: w.txn.content.replace(/\s/g, ""), itemCode: w.itemCode });
        expenses++;
      }
      await d.bankTxns.put({ ...w.txn, appliedAs: w.existingExpenseId ? "expense-reconciled" : "expense" });
    }
  });
  return { made, linked, expenses };
}
