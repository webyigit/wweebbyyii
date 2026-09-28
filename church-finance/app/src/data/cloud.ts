// Supabase 연결. URL 과 공개키(publishable)는 원래 공개용 값이라 코드에 둔다.
// 데이터 보호는 서버 규칙(supabase/schema.sql: 등록된 4명만, 역할만큼)이 맡는다.
import { createClient, type Session } from "@supabase/supabase-js";
import type { Remote, RemoteRecord } from "./sync";

export const SUPABASE_URL = "https://evyiupygrwczfctryqlq.supabase.co";
export const SUPABASE_KEY = "sb_publishable_RFfFydE_yq6k69OdD9FSRQ_kOjfZmM2";

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: "church-finance-auth" },
});

export const supabaseRemote: Remote = {
  async upsert(rows) {
    const { error } = await supabase.from("records").upsert(rows.map((r) => ({ collection: r.collection, id: r.id, doc: r.doc, deleted: r.deleted })));
    if (error) throw new Error(error.message);
  },
  async pullSince(cursor, limit) {
    let q = supabase.from("records").select("collection,id,doc,deleted,updated_at").order("updated_at", { ascending: true }).limit(limit);
    if (cursor) q = q.gt("updated_at", cursor);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return (data ?? []) as RemoteRecord[];
  },
};

export async function currentSession(): Promise<Session | null> {
  return (await supabase.auth.getSession()).data.session;
}

/** 로그인한 사람의 역할 (여러 개면 'bookkeeper,cashier' 처럼 쉼표로, 등록 명단에 없으면 null) */
export async function myRole(): Promise<string | null> {
  const { data, error } = await supabase.rpc("my_role");
  if (error) throw new Error(error.message);
  return (data as string | null) || null;
}

/** 'bookkeeper,cashier' → '기장회계·출납회계' */
export function roleLabel(role: string): string {
  return role.split(",").map((r) => ROLE_NAME[r.trim()] ?? r).join("·");
}

export const ROLE_NAME: Record<string, string> = {
  bookkeeper: "기장회계",
  cashier: "출납회계",
  finance_head: "재정부장",
  pastor: "담임목사",
};
