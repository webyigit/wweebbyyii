import type { GitHubConfig, SyncFileV2, Task } from '../types';
import { decodeBase64, encodeBase64 } from './base64';
import { mergeTasks, parseSyncFile, sameTasks, SyncFileError } from './merge';

const API = 'https://api.github.com';
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const NAME_RE = /^[A-Za-z0-9_.-]{1,100}$/;

export class GitHubError extends Error {}

/** sha 충돌(다른 기기가 사이에 저장) 시 다시 받아 합치는 최대 횟수 */
const MAX_ATTEMPTS = 3;

/** 입력값 검사. 문제가 없으면 null, 있으면 사람이 읽을 메시지 */
export function validateConfig(c: GitHubConfig): string | null {
  if (!NAME_RE.test(c.owner)) return '소유자(계정 이름)를 확인하세요. 영문·숫자·-_. 만 됩니다.';
  if (!NAME_RE.test(c.repo)) return '저장소 이름을 확인하세요. 영문·숫자·-_. 만 됩니다.';
  if (!c.branch.trim() || /\s|\.\.|^\/|\/$/.test(c.branch)) return '브랜치 이름을 확인하세요.';
  const p = c.path.trim();
  if (!p || p.startsWith('/') || p.split('/').some((s) => !s || s === '.' || s === '..')) {
    return '파일 경로를 확인하세요. 예: worklog/tasks.json';
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
  /** 브랜치가 있거나, 커밋이 하나도 없는 빈 저장소의 기본 브랜치라 첫 저장 때 만들어지는 경우 true */
  branchExists: boolean;
  /** 커밋이 하나도 없는 빈 저장소 */
  emptyRepo: boolean;
}

export async function testConnection(c: GitHubConfig, token: string): Promise<ConnectionInfo> {
  const base = `${API}/repos/${enc(c.owner)}/${enc(c.repo)}`;
  const r = await call(token, base);
  if (!r.ok) throw explain(r.status, '저장소');
  const repo = await r.json();
  const b = await call(token, `${base}/branches/${enc(c.branch)}`);
  let emptyRepo = false;
  if (!b.ok) {
    // 빈 저장소(커밋 없음)는 기본 브랜치도 404 → 첫 저장(PUT)이 그 브랜치를 만든다
    const list = await call(token, `${base}/branches?per_page=1`);
    const arr = list.ok ? await list.json().catch(() => null) : null;
    emptyRepo = Array.isArray(arr) && arr.length === 0;
  }
  return {
    canWrite: !!repo?.permissions?.push,
    isPrivate: !!repo?.private,
    branchExists: b.ok || (emptyRepo && c.branch === repo?.default_branch),
    emptyRepo,
  };
}

/** 동기화 전에 매번 확인: 공개로 바뀐 저장소엔 올리지 않는다(자동 동기화 포함) */
export async function assertSafeTarget(c: GitHubConfig, token: string): Promise<ConnectionInfo> {
  const info = await testConnection(c, token);
  if (!info.isPrivate) {
    throw new GitHubError('공개 저장소입니다. 업무 기록이 누구에게나 보이므로 동기화하지 않았습니다. 비공개(private) 저장소를 지정하세요.');
  }
  if (!info.canWrite) throw new GitHubError('저장소는 보이지만 쓰기 권한이 없습니다. 토큰에 Contents 읽기/쓰기를 주세요.');
  if (!info.branchExists) throw new GitHubError(`브랜치 '${c.branch}' 가 없습니다.`);
  return info;
}

interface Remote {
  file: SyncFileV2 | null;
  sha: string | null;
}

export async function readRemote(c: GitHubConfig, token: string, emptyRepo = false): Promise<Remote> {
  if (emptyRepo) return { file: null, sha: null };
  const url = `${API}/repos/${enc(c.owner)}/${enc(c.repo)}/contents/${encPath(c.path)}?ref=${enc(c.branch)}`;
  const r = await call(token, url);
  if (r.status === 404) {
    // 파일이 없는 건 첫 동기화라 정상. 저장소·브랜치는 assertSafeTarget 에서 이미 확인함.
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
    throw new GitHubError(e instanceof SyncFileError ? e.message : '저장소 파일을 읽지 못했습니다.');
  }
}

async function writeRemote(c: GitHubConfig, token: string, tasks: Task[], sha: string | null, now: string, emptyRepo = false) {
  const file: SyncFileV2 = { app: 'worklog', version: 2, exportedAt: now, tasks };
  const body: Record<string, string> = {
    message: `업무 기록 동기화 ${now}`,
    content: encodeBase64(JSON.stringify(file, null, 2) + '\n'),
  };
  // 빈 저장소에서는 브랜치를 지정하면 거절되므로 빼고 보낸다(기본 브랜치 = c.branch 임을 확인한 뒤에만 여기 옴)
  if (!emptyRepo) body.branch = c.branch;
  if (sha) body.sha = sha;
  const url = `${API}/repos/${enc(c.owner)}/${enc(c.repo)}/contents/${encPath(c.path)}`;
  return call(token, url, { method: 'PUT', body: JSON.stringify(body) });
}

export interface SyncResult {
  /** 합친 결과(삭제 표시 포함). 그대로 taskStore.replaceAll 에 넣는다 */
  tasks: Task[];
  /** 원격에서 받아와 이 기기 값이 바뀐 업무 수 */
  pulled: number;
  /** 저장소에 새로 올렸는지 */
  pushed: boolean;
}

/** 받기 → 합치기 → 올리기. 그 사이 다른 기기가 올려서 sha 가 어긋나면 다시 받아 합친다. */
export async function sync(c: GitHubConfig, token: string, local: Task[], now = () => new Date()): Promise<SyncResult> {
  let { emptyRepo } = await assertSafeTarget(c, token);
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const remote = await readRemote(c, token, emptyRepo);
    const remoteTasks = remote.file?.tasks ?? [];
    const merged = mergeTasks(local, remoteTasks);
    const before = new Map(local.map((t) => [t.id, t]));
    const pulled = merged.filter((t) => before.get(t.id) !== t).length;
    if (remote.file && sameTasks(remoteTasks, merged)) return { tasks: merged, pulled, pushed: false };
    const w = await writeRemote(c, token, merged, remote.sha, now().toISOString(), emptyRepo);
    if (w.ok) return { tasks: merged, pulled, pushed: true };
    // 409/422: 사이에 다른 기기가 저장(sha 어긋남) → 다시 받아 합친다
    if (w.status === 409 || w.status === 422) {
      emptyRepo = false;
      continue;
    }
    throw explain(w.status, '파일');
  }
  throw new GitHubError('다른 기기와 동시에 저장되어 충돌했습니다. 잠시 뒤 다시 시도하세요.');
}

/** 복원 전용: 저장소 파일을 받아오기만 한다(이 기기 값과 합치는 건 호출하는 쪽에서). */
export async function pull(c: GitHubConfig, token: string): Promise<Task[] | null> {
  const { emptyRepo } = await assertSafeTarget(c, token);
  const r = await readRemote(c, token, emptyRepo);
  return r.file ? r.file.tasks : null;
}
