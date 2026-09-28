import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { downloadBlob, downloadWorkbook } from "../data/download";
import { exportWorkbook, lastBackupAt, makeBackup, markBackedUp, parseBackup, restoreBackup, summarize, type Backup } from "../data/backup";
import { toYmd } from "../domain/dates";

// 전체 백업(파일 한 개) · 되살리기 · 엑셀로 내보내기. 1주에 한 번 백업 파일을 교회 드라이브에 올려 두기를 권함.
export default function BackupCard() {
  const last = useLiveQuery(() => lastBackupAt(), []);
  const [pending, setPending] = useState<Backup | null>(null);
  const [msg, setMsg] = useState("");
  const days = last ? Math.floor((Date.now() - Date.parse(last)) / 86400000) : null;
  const download = (name: string, text: string) => downloadBlob(name, text, "application/json");

  return (
    <div className="card backup">
      <h3>백업</h3>
      <p className={days === null || days > 7 ? "warn" : "muted"}>
        {days === null ? "아직 백업한 적이 없습니다." : `마지막 백업: ${days === 0 ? "오늘" : `${days}일 전`}`} 1주에 한 번, 받은 파일을 교회 구글 드라이브에 올려 두세요.
      </p>
      <div className="row">
        <button className="primary" onClick={async () => {
          const b = await makeBackup();
          download(`교회재정_백업_${toYmd(new Date())}.json`, JSON.stringify(b));
          await markBackedUp();
          setMsg(`백업 파일을 받았습니다 (${summarize(b).reduce((s, x) => s + x.rows, 0).toLocaleString()}건).`);
        }}>전체 백업 받기</button>
        <button onClick={async () => { downloadWorkbook(await exportWorkbook(), `교회재정_${toYmd(new Date())}.xlsx`); }}>엑셀로 내보내기 (읽기용)</button>
        <label className="file"><span>백업에서 되살리기…</span>
          <input type="file" accept=".json,application/json" onChange={async (e) => {
            setMsg("");
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f) return;
            try { setPending(parseBackup(await f.text())); } catch (x) { setMsg((x as Error).message); }
          }} />
        </label>
      </div>
      {pending && (
        <div className="edit restore-confirm">
          <p><b>{new Date(pending.at).toLocaleString("ko-KR")}</b> 백업: {summarize(pending).map((x) => `${x.name} ${x.rows}`).join(" · ")}</p>
          <p className="warn">이 기기의 기록을 모두 지우고 백업 내용으로 바꿉니다. 로그인해 있으면 다른 기기에도 퍼집니다.</p>
          <div className="row">
            <button className="primary" onClick={async () => { const n = await restoreBackup(pending); setPending(null); setMsg(`되살렸습니다 (${n.toLocaleString()}건).`); }}>되살리기</button>
            <button onClick={() => setPending(null)}>취소</button>
          </div>
        </div>
      )}
      {msg && <p className="ok backup-msg">{msg}</p>}
      <p className="small muted">백업 파일에는 연락처·주소가 들어 있습니다(주민번호는 잠긴 채). 교회 계정 드라이브에만 두세요. '엑셀로 내보내기'에는 주민번호가 없습니다.</p>
    </div>
  );
}
