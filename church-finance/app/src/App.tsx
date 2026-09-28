import { useEffect, useState } from "react";
import { ensureSeed } from "./data/db";
import { currentSunday } from "./domain/dates";
import OfferingEntry from "./pages/OfferingEntry";
import WeeklyReportView from "./pages/WeeklyReportView";
import Households from "./pages/Households";
import Budgets from "./pages/Budgets";

const TABS = [
  { key: "entry", label: "헌금 입력" },
  { key: "report", label: "주일헌금현황" },
  { key: "people", label: "교인·가정" },
  { key: "budget", label: "예산" },
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
        <span className="sync" title="클라우드 연결은 설정 후 켜집니다">● 이 기기에 저장됨</span>
      </header>
      <main>
        {tab === "entry" && <OfferingEntry date={date} setDate={setDate} />}
        {tab === "report" && <WeeklyReportView date={date} setDate={setDate} />}
        {tab === "people" && <Households />}
        {tab === "budget" && <Budgets year={Number(date.slice(0, 4))} />}
      </main>
    </>
  );
}
