import { useEffect, useState } from "react";
import { ensureSeed } from "./data/db";
import { currentSunday } from "./domain/dates";
import OfferingEntry from "./pages/OfferingEntry";
import WeeklyReportView from "./pages/WeeklyReportView";
import Households from "./pages/Households";
import Budgets from "./pages/Budgets";
import ImportExcel from "./pages/ImportExcel";
import Expenses from "./pages/Expenses";
import CashbookReportView from "./pages/CashbookReportView";
import BankImport from "./pages/BankImport";
import Account from "./pages/Account";
import { useSync } from "./data/useSync";

const TABS = [
  { key: "entry", label: "헌금 입력" },
  { key: "report", label: "주일헌금현황" },
  { key: "expense", label: "지출 입력" },
  { key: "cashbook", label: "수입지출 보고" },
  { key: "bank", label: "통장 내역" },
  { key: "people", label: "교인·가정" },
  { key: "budget", label: "예산·이월" },
  { key: "import", label: "엑셀 가져오기" },
  { key: "account", label: "계정" },
] as const;
type Tab = (typeof TABS)[number]["key"];

function readHash(): Tab {
  const h = location.hash.replace("#", "") as Tab;
  return TABS.some((t) => t.key === h) ? h : "entry";
}

export default function App() {
  const [tab, setTab] = useState<Tab>(readHash);
  // 고른 주일은 탭을 닫을 때까지 기억 (새로고침해도 유지, 다음에 열면 이번 주일)
  const [date, setDateState] = useState(() => {
    try { return sessionStorage.getItem("sunday") || currentSunday(); } catch { return currentSunday(); }
  });
  const setDate = (d: string) => {
    setDateState(d);
    try { sessionStorage.setItem("sunday", d); } catch { /* 저장 못 해도 동작 */ }
  };
  const [ready, setReady] = useState(false);
  const { state: sync, syncNow } = useSync();

  useEffect(() => {
    ensureSeed().then(() => setReady(true));
    const on = () => setTab(readHash());
    addEventListener("hashchange", on);
    return () => removeEventListener("hashchange", on);
  }, []);

  if (!ready) return <p className="pad">불러오는 중…</p>;

  return (
    <>
      <header className="top no-print">
        <strong>교회 재정관리</strong>
        <nav>
          {TABS.map((t) => (
            <a key={t.key} href={`#${t.key}`} className={tab === t.key ? "on" : ""}>
              {t.label}
            </a>
          ))}
        </nav>
        <a className={`sync ${sync.status}`} href="#account" title={sync.message ?? ""}>
          ● {{ local: "이 기기에만 저장 (로그인하면 동기화)", syncing: "동기화 중…", ok: `동기화됨${sync.lastAt ? " " + new Date(sync.lastAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" }) : ""}`, offline: "오프라인 — 이 기기에 저장 중", error: "동기화 오류", unregistered: "등록되지 않은 계정" }[sync.status]}
        </a>
      </header>
      <main>
        {tab === "entry" && <OfferingEntry date={date} setDate={setDate} />}
        {tab === "report" && <WeeklyReportView date={date} setDate={setDate} />}
        {tab === "expense" && <Expenses date={date} setDate={setDate} />}
        {tab === "cashbook" && <CashbookReportView date={date} setDate={setDate} />}
        {tab === "bank" && <BankImport />}
        {tab === "people" && <Households />}
        {tab === "budget" && <Budgets year={Number(date.slice(0, 4))} />}
        {tab === "import" && <ImportExcel />}
        {tab === "account" && <Account sync={sync} syncNow={syncNow} />}
      </main>
    </>
  );
}
