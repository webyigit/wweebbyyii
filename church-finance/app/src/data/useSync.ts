// 화면 어디서나 쓰는 동기화 상태. 로그인돼 있으면 켤 때·30초마다·다시 온라인이 될 때 동기화한다.
import { useCallback, useEffect, useRef, useState } from "react";
import { currentSession, myRole, supabase, supabaseRemote } from "./cloud";
import { pendingCount, syncOnce } from "./sync";

export type SyncStatus = "local" | "syncing" | "ok" | "offline" | "error" | "unregistered";
export interface SyncState { status: SyncStatus; email?: string; role?: string | null; lastAt?: string; pending: number; message?: string }

export function useSync() {
  const [state, setState] = useState<SyncState>({ status: "local", pending: 0 });
  const running = useRef(false);

  const run = useCallback(async () => {
    if (running.current) return;
    const session = await currentSession().catch(() => null);
    if (!session?.user.email) {
      setState({ status: "local", pending: 0 });
      return;
    }
    const email = session.user.email;
    if (!navigator.onLine) {
      setState((s) => ({ ...s, status: "offline", email }));
      return;
    }
    running.current = true;
    setState((s) => ({ ...s, status: "syncing", email }));
    try {
      const role = await myRole();
      if (!role) {
        setState({ status: "unregistered", email, role: null, pending: 0, message: "등록되지 않은 이메일입니다. 재정부에 등록을 요청하세요." });
        return;
      }
      const r = await syncOnce(supabaseRemote, undefined, 500, role);
      setState({ status: "ok", email, role, lastAt: r.at, pending: await pendingCount(undefined, role) });
    } catch (e) {
      setState((s) => ({ ...s, status: navigator.onLine ? "error" : "offline", message: String((e as Error).message ?? e) }));
    } finally {
      running.current = false;
    }
  }, []);

  useEffect(() => {
    run();
    const t = setInterval(run, 30000);
    const on = () => run();
    addEventListener("online", on);
    addEventListener("focus", on);
    const { data } = supabase.auth.onAuthStateChange(() => { setTimeout(run, 0); });
    return () => { clearInterval(t); removeEventListener("online", on); removeEventListener("focus", on); data.subscription.unsubscribe(); };
  }, [run]);

  return { state, syncNow: run };
}
