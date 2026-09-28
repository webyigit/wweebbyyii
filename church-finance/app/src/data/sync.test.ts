import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { FinanceDB, ensureSeed, newId, touch } from "./db";
import { pendingCount, syncOnce, type Remote, type RemoteRecord } from "./sync";
import type { Offering } from "../domain/types";

/** 흉내 서버: records 표 + 서버 시각 + 역할 규칙 */
class FakeServer {
  rows = new Map<string, RemoteRecord>();
  clock = 0;
  remote(role: string, writable: string[]): Remote {
    return {
      upsert: async (rows) => {
        if (rows.some((r) => !writable.includes(r.collection))) throw new Error(`권한 없음 (${role})`);
        for (const r of rows) this.rows.set(`${r.collection}|${r.id}`, { ...r, updated_at: new Date(Date.UTC(2026, 0, 1, 0, 0, 0, ++this.clock)).toISOString() });
      },
      pullSince: async (cursor, limit) =>
        [...this.rows.values()].filter((r) => !cursor || r.updated_at > cursor).sort((a, b) => a.updated_at.localeCompare(b.updated_at)).slice(0, limit),
    };
  }
}

let n = 0;
const off = (p: Partial<Offering> = {}): Offering => touch({ id: newId(), updatedAt: 0, createdAt: ++n, date: "2026-09-27", categoryCode: "G-TITHE", donorText: "홍길동", amount: 10000, method: "cash", ...p });

describe("동기화", () => {
  let server: FakeServer, pc: FinanceDB, phone: FinanceDB, cashierPc: FinanceDB;
  const BK = ["offerings", "households", "members", "aliases", "categories", "budgets"];
  const CA = ["expenses", "fixedRules", "budgets", "openings", "bankTxns", "bankRules", "expenseItems", "offerings"];
  beforeEach(async () => {
    server = new FakeServer();
    pc = new FinanceDB(`pc-${Math.random()}`); phone = new FinanceDB(`phone-${Math.random()}`); cashierPc = new FinanceDB(`ca-${Math.random()}`);
    for (const d of [pc, phone, cashierPc]) await ensureSeed(d);
  });

  it("PC 에서 입력한 헌금이 휴대폰에 나타남, 두 번째 동기화는 보낼 것 없음", async () => {
    await pc.offerings.bulkPut([off(), off({ amount: 20000 })]);
    const r1 = await syncOnce(server.remote("bookkeeper", BK), pc, 500, "bookkeeper");
    expect(r1.pushed).toBeGreaterThanOrEqual(2);
    expect(await pendingCount(pc, "bookkeeper")).toBe(0);
    const r2 = await syncOnce(server.remote("bookkeeper", BK), pc, 500, "bookkeeper");
    expect(r2.pushed).toBe(0);
    await syncOnce(server.remote("bookkeeper", BK), phone, 500, "bookkeeper");
    expect((await phone.offerings.toArray()).map((o) => o.amount).sort()).toEqual([10000, 20000]);
  });

  it("휴대폰에서 고치거나 지운 것이 PC 로 (지우기는 표시만)", async () => {
    const o = off();
    await pc.offerings.put(o);
    await syncOnce(server.remote("bookkeeper", BK), pc, 500, "bookkeeper");
    await syncOnce(server.remote("bookkeeper", BK), phone, 500, "bookkeeper");
    await phone.offerings.put(touch({ ...(await phone.offerings.get(o.id))!, amount: 99000 }));
    await syncOnce(server.remote("bookkeeper", BK), phone, 500, "bookkeeper");
    await syncOnce(server.remote("bookkeeper", BK), pc, 500, "bookkeeper");
    expect((await pc.offerings.get(o.id))!.amount).toBe(99000);
    await pc.offerings.put(touch({ ...(await pc.offerings.get(o.id))!, deleted: true }));
    await syncOnce(server.remote("bookkeeper", BK), pc, 500, "bookkeeper");
    await syncOnce(server.remote("bookkeeper", BK), phone, 500, "bookkeeper");
    expect((await phone.offerings.get(o.id))!.deleted).toBe(true);
  });

  it("출납회계 기기는 자기 역할의 종류만 보내고(거절 없음), 헌금·교인은 받기만", async () => {
    await pc.offerings.put(off());
    await syncOnce(server.remote("bookkeeper", BK), pc, 500, "bookkeeper");
    await cashierPc.expenses.put(touch({ id: newId(), updatedAt: 0, createdAt: 1, date: "2026-09-27", itemCode: "FACILITY-8", amount: 5000, description: "가스", source: "manual" as const }));
    await cashierPc.budgets.put({ year: 2026, code: "WORSHIP-1", amount: 500000 });
    await expect(syncOnce(server.remote("cashier", CA), cashierPc, 500, "cashier")).resolves.toBeTruthy();
    expect(await cashierPc.offerings.count()).toBe(1);
    await syncOnce(server.remote("bookkeeper", BK), pc, 500, "bookkeeper");
    expect(await pc.expenses.count()).toBe(1);
    expect((await pc.budgets.get([2026, "WORSHIP-1"]))!.amount).toBe(500000);
  });

  it("많은 기록(3,000건)도 나눠서 보내고 받음", async () => {
    await pc.offerings.bulkPut(Array.from({ length: 3000 }, (_, i) => off({ amount: i + 1 })));
    const r = await syncOnce(server.remote("bookkeeper", BK), pc, 500, "bookkeeper");
    expect(r.pushed).toBeGreaterThanOrEqual(3000);
    const p = await syncOnce(server.remote("bookkeeper", BK), phone, 500, "bookkeeper");
    expect(p.pulled).toBeGreaterThanOrEqual(3000);
    expect(await phone.offerings.count()).toBe(3000);
  }, 60000);

  it("보내다 끊겨도(서버 오류) 기기 데이터는 그대로, 다음에 다시 보냄", async () => {
    await pc.offerings.put(off());
    const broken: Remote = { upsert: async () => { throw new Error("네트워크"); }, pullSince: async () => [] };
    await expect(syncOnce(broken, pc, 500, "bookkeeper")).rejects.toThrow();
    expect(await pc.offerings.count()).toBe(1);
    expect(await pendingCount(pc, "bookkeeper")).toBeGreaterThan(0);
    await syncOnce(server.remote("bookkeeper", BK), pc, 500, "bookkeeper");
    expect(await pendingCount(pc, "bookkeeper")).toBe(0);
  }, 30000);
});
