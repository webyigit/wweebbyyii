import { db, newId, softDelete, touch, type FinanceDB } from "./db";
import type { DonorAlias, Household, Member, Offering, PayMethod } from "../domain/types";
import { offeringDate, type ImportPlan } from "../domain/importOfferings";

export async function addOffering(
  o: { date: string; categoryCode: string; householdId?: string; donorText: string; amount: number; method: PayMethod; note?: string },
  d: FinanceDB = db,
) {
  const row: Offering = touch({ id: newId(), updatedAt: 0, createdAt: Date.now(), ...o });
  await d.offerings.put(row);
  return row;
}

export const deleteOffering = (id: string, d: FinanceDB = db) => softDelete(d.offerings as never, id);

/** 엑셀 가져오기 계획을 실제로 저장한다 (한 번의 트랜잭션: 중간에 실패하면 아무것도 안 들어감) */
export async function applyImport(plan: ImportPlan, d: FinanceDB = db) {
  const idOf = new Map<string, string>();
  const households: Household[] = [];
  const members: Member[] = [];
  const aliases: DonorAlias[] = [];
  for (const h of plan.households) {
    if (h.existingId) {
      idOf.set(h.key, h.existingId);
    } else {
      const hid = newId();
      idOf.set(h.key, hid);
      const ms = h.names.map((raw) => {
        const tag = raw.match(/[A-Z]$/)?.[0];
        return touch<Member>({ id: newId(), updatedAt: 0, householdId: hid, name: tag ? raw.slice(0, -1) : raw, tag });
      });
      members.push(...ms);
      households.push(touch<Household>({ id: hid, updatedAt: 0, name: `${ms[0]?.name ?? "?"} 가정`, receiptMemberId: ms[0]?.id, needsReview: h.needsReview }));
    }
    const known = new Set((await d.aliases.where("householdId").equals(idOf.get(h.key)!).toArray()).map((a) => a.text));
    for (const t of h.texts) if (!known.has(t)) aliases.push(touch<DonorAlias>({ id: newId(), updatedAt: 0, text: t, householdId: idOf.get(h.key)! }));
  }
  const base = Date.now();
  const offerings: Offering[] = plan.offerings.map((o, i) =>
    touch<Offering>({
      id: newId(), updatedAt: 0, createdAt: base + i,
      date: offeringDate(o.src.date), categoryCode: o.categoryCode,
      householdId: o.householdKey ? idOf.get(o.householdKey) : undefined,
      donorText: o.donorText, amount: o.src.amount, method: "cash", note: o.src.note, importKey: o.importKey,
    }),
  );
  await d.transaction("rw", [d.households, d.members, d.aliases, d.offerings], async () => {
    await d.households.bulkPut(households);
    await d.members.bulkPut(members);
    await d.aliases.bulkPut(aliases);
    await d.offerings.bulkPut(offerings);
  });
  return { households: households.length, offerings: offerings.length };
}

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
