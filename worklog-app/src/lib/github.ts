import type { Entry, GitHubConfig, SyncFile } from '../types';
import { decodeBase64, encodeBase64 } from './base64';
import { mergeEntries, parseSyncFile } from './merge';

const API = 'https://api.github.com';
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const NAME_RE = /^[A-Za-z0-9_.-]{1,100}$/;

export class GitHubError extends Error {}

/** 입력값 검사. 문제가 없으면 null, 있으면 사람이 읽을 메시지 */
export function validateConfig(c: GitHubConfig): string | null {
  if (!NAME_RE.test(c.owner)) return '소유자(계정 이름)를 확인하세요. 영문·숫자·-_. 만 됩니다.';
  if (!NAME_RE.test(c.repo)) return '저장소 이름을 확인하세요. 영문·숫자·-_. 만 됩니다.';
  if (!c.branch.trim() || /\s|\.\.|^\/|\/$/.test(c.branch)) return '브랜치 이름을 확인하세요.';
  const p = c.path.trim();
  if (!p || p.startsWith('/') || p.split('/').some((s) => !s || s === '.' || s === '..')) {
    return '파일 경로를 확인하세요. 예: worklog/data.json';
  }
  if (!p.endsWith('.json')) return '파일 경로는 .json 으로 끝나야 합니다.';
  return null;
}

const enc = (s: string) => encodeURIComponent(s);
const encPath = (p: string) => p.split('/').map(enc).join('/');

async function call(token: string, url: string, init: RequestInit = {}): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      },
    });
  } catch {
    throw new GitHubError('인터넷에 연결할 수 없습니다. 연결을 확인하고 다시 시도하세요.');
  }
  return res;
}

function explain(status: number, what: string): GitHubError {
  if (status === 401) return new GitHubError('토큰이 올바르지 않거나 만료되었습니다. 새 토큰을 넣어 주세요.');
  if (status === 403) return new GitHubError('토큰 권한이 부족하거나 요청 한도를 넘었습니다. Contents 읽기/쓰기 권한을 확인하세요.');
  if (status === 404) return new GitHubError(`${what}을(를) 찾을 수 없습니다. 이름과 토큰의 저장소 접근 권한을 확인하세요.`);
  return new GitHubError(`GitHub 응답 오류(${status}). 잠시 뒤 다시 시도하세요.`);
}

export interface ConnectionInfo {
  canWrite: boolean;
  isPrivate: boolean;
  branchExists: boolean;
}

export async function testConnection(c: GitHubConfig, token: string): Promise<ConnectionInfo> {
  const r = await call(token, `${API}/repos/${enc(c.owner)}/${enc(c.repo)}`);
  if (!r.ok) throw explain(r.status, '저장소');
  const repo = await r.json();
  const b = await call(token, `${API}/repos/${enc(c.owner)}/${enc(c.repo)}/branches/${enc(c.branch)}`);
  return {
    canWrite: !!repo?.permissions?.push,
    isPrivate: !!repo?.private,
    branchExists: b.ok,
  };
}

interface Remote {
  file: SyncFile | null;
  sha: string | null;
}

export async function readRemote(c: GitHubConfig, token: string): Promise<Remote> {
  const url = `${API}/repos/${enc(c.owner)}/${enc(c.repo)}/contents/${encPath(c.path)}?ref=${enc(c.branch)}`;
  const r = await call(token, url);
  if (r.status === 404) {
    // 파일이 없는 건 첫 동기화라 정상. 저장소 자체가 없는지는 따로 확인.
    const repo = await call(token, `${API}/repos/${enc(c.owner)}/${enc(c.repo)}`);
    if (!repo.ok) throw explain(repo.status, '저장소');
    const br = await call(token, `${API}/repos/${enc(c.owner)}/${enc(c.repo)}/branches/${enc(c.branch)}`);
    if (!br.ok) throw explain(br.status, `브랜치 '${c.branch}'`);
    return { file: null, sha: null };
  }
  if (!r.ok) throw explain(r.status, '파일');
  const j = await r.json();
  if (Array.isArray(j) || j.type !== 'file') throw new GitHubError('파일 경로가 폴더를 가리킵니다. 파일 이름까지 적어 주세요.');
  if (typeof j.size === 'number' && j.size > MAX_FILE_BYTES) {
    throw new GitHubError('저장소 파일이 너무 큽니다(5MB 초과). 파일 경로를 확인하세요.');
  }
  let content: string = j.content ?? '';
  if (!content && j.sha) {
    // 1MB 넘는 파일은 contents API 가 본문을 안 줌 → blob 으로 받기
    const blob = await call(token, `${API}/repos/${enc(c.owner)}/${enc(c.repo)}/git/blobs/${enc(j.sha)}`);
    if (!blob.ok) throw explain(blob.status, '파일');
    content = (await blob.json()).content ?? '';
  }
  try {
    return { file: parseSyncFile(decodeBase64(content)), sha: j.sha };
  } catch (e) {
    throw new GitHubError(e instanceof SyntaxError ? '저장소 파일이 올바른 JSON 이 아닙니다.' : (e as Error).message);
  }
}

async function writeRemote(c: GitHubConfig, token: string, entries: Entry[], sha: string | null, now: string) {
  const file: SyncFile = { app: 'worklog', version: 1, exportedAt: now, entries };
  const body: Record<string, string> = {
    message: `업무 기록 동기화 ${now}`,
    content: encodeBase64(JSON.stringify(file, null, 2) + '\n'),
    branch: c.branch,
  };
  if (sha) body.sha = sha;
  const url = `${API}/repos/${enc(c.owner)}/${enc(c.repo)}/contents/${encPath(c.path)}`;
  return call(token, url, { method: 'PUT', body: JSON.stringify(body) });
}

export interface SyncResult {
  entries: Entry[];
  pulled: number;
  pushed: boolean;
}

/** 받기 → 합치기 → 올리기. 그 사이 다른 기기가 올려서 sha 가 어긋나면 한 번 더 시도. */
export async function sync(c: GitHubConfig, token: string, local: Entry[]): Promise<SyncResult> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const remote = await readRemote(c, token);
    const remoteEntries = remote.file?.entries ?? [];
    const merged = mergeEntries(local, remoteEntries);
    const localIds = new Map(local.map((e) => [e.id, e.updatedAt + (e.deletedAt ?? '')]));
    const pulled = merged.filter((e) => localIds.get(e.id) !== e.updatedAt + (e.deletedAt ?? '')).length;
    const same =
      remote.file && JSON.stringify(mergeEntries([], remoteEntries)) === JSON.stringify(merged);
    if (same) return { entries: merged, pulled, pushed: false };
    const w = await writeRemote(c, token, merged, remote.sha, new Date().toISOString());
    if (w.ok) return { entries: merged, pulled, pushed: true };
    if ((w.status === 409 || w.status === 422) && attempt === 0) continue;
    throw explain(w.status, '파일');
  }
  throw new GitHubError('다른 기기와 동시에 저장되어 충돌했습니다. 다시 시도하세요.');
}
