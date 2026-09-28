import { db, newId, softDelete, touch, type FinanceDB } from "./db";
import type { Household, Offering, PayMethod } from "../domain/types";

export async function addOffering(
  o: { date: string; categoryCode: string; householdId?: string; donorText: string; amount: number; method: PayMethod; note?: string },
  d: FinanceDB = db,
) {
  const row: Offering = touch({ id: newId(), updatedAt: 0, createdAt: Date.now(), ...o });
  await d.offerings.put(row);
  return row;
}

export const deleteOffering = (id: string, d: FinanceDB = db) => softDelete(d.offerings as never, id);

/**
 * 처음 보는 이름 "홍길동,김영희" → 가정 1개 + 교인 2명 + 표기(별칭) 1개를 한 번에 만든다.
 * 영수증 신청자는 일단 첫 번째 사람으로 두고, 교인·가정 화면에서 바꿀 수 있다.
 */
export async function createHouseholdFromText(text: string, d: FinanceDB = db): Promise<Household> {
  const names = text.split(/[,·/]/).map((s) => s.trim()).filter(Boolean);
  const hid = newId();
  const memberIds = names.map(() => newId());
  const household: Household = touch({ id: hid, updatedAt: 0, name: `${names[0] ?? text} 가정`, receiptMemberId: memberIds[0] });
  await d.transaction("rw", d.households, d.members, d.aliases, async () => {
    await d.households.put(household);
    await d.members.bulkPut(
      names.map((name, i) => {
        const tag = name.match(/[A-Z]$/)?.[0];
        return touch({ id: memberIds[i], updatedAt: 0, householdId: hid, name: tag ? name.slice(0, -1) : name, tag });
      }),
    );
    await d.aliases.put(touch({ id: newId(), updatedAt: 0, text, householdId: hid }));
  });
  return household;
}
