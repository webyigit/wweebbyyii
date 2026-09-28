import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { FinanceDB, ensureSeed, newId, touch } from "./db";
import { exportWorkbook, makeBackup, parseBackup, restoreBackup, summarize } from "./backup";
import { pendingCount } from "./sync";
import type { Offering } from "../domain/types";

const off = (p: Partial<Offering> = {}): Offering => touch({ id: newId(), updatedAt: 0, createdAt: 1, date: "2026-09-27", categoryCode: "G-TITHE", donorText: "홍길동", amount: 10000, method: "cash", ...p });

describe("백업·되살리기", () => {
  it("백업 → 다른 기기에서 되살리면 기록이 그대로, 동기화 표시는 빼고, 되살린 뒤엔 전부 다시 올림", async () => {
    const pc = new FinanceDB(`b-pc-${Math.random()}`); await ensureSeed(pc);
    await pc.offerings.bulkPut([off(), off({ amount: 5000, donorText: "김영희" })]);
    await pc.expenses.put(touch({ id: newId(), updatedAt: 0, createdAt: 1, date: "2026-09-27", itemCode: "FACILITY-8", amount: 53030, description: "전기요금", source: "manual" as const }));
    await pc.budgets.put({ year: 2026, code: "G-TITHE", amount: 100 });
    await pc.meta.put({ key: "sync:sent", value: { x: "y" } });
    const text = JSON.stringify(await makeBackup(pc));
    const b = parseBackup(text);
    expect(b.tables.meta.some((m) => String((m as { key: string }).key).startsWith("sync:"))).toBe(false);
    expect(summarize(b).find((x) => x.name === "offerings")!.rows).toBe(2);

    const other = new FinanceDB(`b-new-${Math.random()}`); await ensureSeed(other);
    await other.offerings.put(off({ donorText: "지워질 기록" }));
    await other.meta.put({ key: "sync:sent", value: { old: "1" } });
    await restoreBackup(b, other);
    expect((await other.offerings.toArray()).map((o) => o.donorText).sort()).toEqual(["김영희", "홍길동"]);
    expect(await other.expenses.count()).toBe(1);
    expect((await other.budgets.get([2026, "G-TITHE"]))!.amount).toBe(100);
    expect(await other.meta.get("sync:sent")).toBeUndefined();
    expect(await pendingCount(other, "bookkeeper,cashier")).toBeGreaterThan(3);
  }, 30_000);

  it("다른 파일은 거절", () => {
    expect(() => parseBackup("{}")).toThrow();
    expect(() => parseBackup("아무 글자")).toThrow();
  });

  it("사람이 읽는 엑셀: 헌금·지출 시트에 이름과 과목", async () => {
    const d = new FinanceDB(`b-x-${Math.random()}`); await ensureSeed(d);
    await d.offerings.put(off());
    const wb = await exportWorkbook(d);
    expect(wb.SheetNames).toEqual(["헌금", "지출", "가정·교인", "예산", "전년이월"]);
    const XLSX = await import("xlsx");
    const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets["헌금"], { header: 1 });
    expect(rows[1]).toEqual(["2026-09-27", "G", "십일조", "홍길동", 10000, "현금", ""]);
  }, 30_000);
});
