import { useState } from "react";
import { roleLabel, supabase } from "../data/cloud";
import { writableFor } from "../data/sync";
import type { SyncState } from "../data/useSync";

// 로그인 · 동기화 상태. 로그인하지 않아도 이 기기 안에서는 모두 쓸 수 있다.
export default function Account({ sync, syncNow }: { sync: SyncState; syncNow: () => void }) {
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function signIn() {
    setBusy(true); setMsg("");
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: pw });
    setBusy(false);
    if (error) setMsg(error.message.includes("Invalid") ? "이메일이나 비밀번호가 맞지 않습니다." : error.message.includes("confirm") ? "가입 확인 메일의 링크를 먼저 눌러 주세요." : error.message);
    else syncNow();
  }
  async function signUp() {
    if (pw.length < 8) return setMsg("비밀번호는 8자 이상으로 해 주세요.");
    setBusy(true); setMsg("");
    const { error } = await supabase.auth.signUp({ email: email.trim(), password: pw, options: { emailRedirectTo: location.origin + location.pathname } });
    setBusy(false);
    setMsg(error ? error.message : "가입 확인 메일을 보냈습니다. 메일의 링크를 누른 뒤 여기서 로그인하세요.");
  }

  if (sync.email) {
    return (
      <section className="pad" data-page="account">
        <h2>계정 · 동기화</h2>
        <div className="card">
          <p><b>{sync.email}</b> {sync.role ? `· ${roleLabel(sync.role)}` : ""}</p>
          <p className={sync.status === "ok" ? "ok" : sync.status === "error" || sync.status === "unregistered" ? "warn" : "muted"}>
            {{ ok: "✔ 동기화됨", syncing: "동기화 중…", offline: "인터넷 연결 없음 — 이 기기에 저장하고, 연결되면 올립니다", error: "동기화 오류", local: "", unregistered: "등록되지 않은 이메일" }[sync.status]}
            {sync.lastAt && ` · 마지막 ${new Date(sync.lastAt).toLocaleString("ko-KR")}`}
            {sync.pending > 0 && ` · 올릴 기록 ${sync.pending}건`}
          </p>
          {sync.message && <p className="warn small">{sync.message}</p>}
          {sync.role && writableFor(sync.role).size === 0 && <p className="muted small">보기 전용 계정입니다. 입력한 내용은 이 기기에만 남고 올라가지 않습니다.</p>}
          <div className="row">
            <button className="primary" onClick={syncNow}>지금 동기화</button>
            <button onClick={async () => { await supabase.auth.signOut(); syncNow(); }}>로그아웃</button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="pad" data-page="account">
      <h2>로그인</h2>
      <p className="muted">로그인하면 PC·휴대폰의 기록이 서로 맞춰집니다. 로그인하지 않아도 이 기기 안에서는 모두 쓸 수 있습니다.</p>
      <div className="card login">
        <div className="field"><label>이메일</label><input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        <div className="field"><label>비밀번호</label><input type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} onKeyDown={(e) => e.key === "Enter" && signIn()} /></div>
        <div className="row">
          <button className="primary" disabled={busy || !email || !pw} onClick={signIn}>로그인</button>
          <button disabled={busy || !email || !pw} onClick={signUp}>처음이면 가입</button>
        </div>
        {msg && <p className="msg">{msg}</p>}
        <p className="small muted">재정부에 등록된 이메일(기장회계·출납회계·재정부장·담임목사)만 데이터를 볼 수 있습니다.</p>
      </div>
    </section>
  );
}
