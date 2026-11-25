// GitHub 동기화 모듈 테스트. 실행: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodeBase64, encodeBase64 } from '../src/lib/base64';
import { mergeTasks, parseSyncFile } from '../src/lib/merge';
import { sync, testConnection, validateConfig } from '../src/lib/github';
import type { Task } from '../src/types';

const T = (id: string, updatedAt: string, extra: Partial<Task> = {}): Task => ({
  id, title: `${id} 업무`, date: '2026-11-25', done: false, order: 1,
  createdAt: '2026-11-20T00:00:00Z', updatedAt, ...extra,
});
const file = (tasks: unknown[], extra: object = {}) => JSON.stringify({ app: 'worklog', version: 2, exportedAt: '', tasks, ...extra });

test('base64: 한글·이모지 왕복, 표준 결과와 일치, 줄바꿈 섞인 응답', () => {
  for (const s of ['', 'a', 'ab', 'abc', '업무 기록 ✅ 🚀', JSON.stringify({ x: '한 일\n할 일' })]) {
    const b = encodeBase64(s);
    assert.equal(b, Buffer.from(s, 'utf8').toString('base64'));
    assert.equal(decodeBase64(b), s);
  }
  const long = '가'.repeat(200);
  assert.equal(decodeBase64(Buffer.from(long).toString('base64').replace(/(.{60})/g, '$1\n')), long);
});

test('합치기: updatedAt 늦은 쪽, 삭제 전달, 순서 무관', () => {
  const a = [T('a1', '2026-11-25T10:00:00Z', { title: '옛 제목' }), T('a2', '2026-11-24T09:00:00Z')];
  const b = [
    T('a1', '2026-11-25T11:00:00Z', { title: '새 제목' }),
    T('a2', '2026-11-25T12:00:00Z', { deletedAt: '2026-11-25T12:00:00Z' }),
    T('b1', '2026-11-25T01:00:00Z'),
  ];
  const m = mergeTasks(a, b);
  assert.equal(m.length, 3);
  assert.equal(m.find((t) => t.id === 'a1')!.title, '새 제목');
  assert.ok(m.find((t) => t.id === 'a2')!.deletedAt);
  assert.deepEqual(mergeTasks(b, a), m);
});

test('합치기: 같은 시각이면 삭제가 이기고, 내용이 달라도 기기마다 같은 결과', () => {
  const x = T('a', '2026-11-25T10:00:00Z', { title: 'X' });
  const y = T('a', '2026-11-25T10:00:00Z', { title: 'Y' });
  assert.deepEqual(mergeTasks([x], [y]), mergeTasks([y], [x]));
  const del = T('a', '2026-11-25T10:00:00Z', { deletedAt: '2026-11-25T10:00:00Z' });
  assert.ok(mergeTasks([x], [del])[0].deletedAt);
  assert.ok(mergeTasks([del], [x])[0].deletedAt);
});

test('파일 검사: 다른 JSON·v1·더 새 버전은 거부(덮어쓰지 않음)', () => {
  assert.throws(() => parseSyncFile('{"foo":1}'));
  assert.throws(() => parseSyncFile('not json'));
  assert.throws(() => parseSyncFile(JSON.stringify({ app: 'worklog', version: 1, entries: [] })), /v1/);
  assert.throws(() => parseSyncFile(JSON.stringify({ app: 'worklog', version: 3, tasks: [] })), /업데이트/);
  assert.throws(() => parseSyncFile(file([T('ok', '2026-11-25T10:00:00Z'), { id: 1 }, null])), /2개/);
  assert.equal(parseSyncFile(file([T('ok', '2026-11-25T10:00:00Z')])).tasks.length, 1);
});

test('보안: 원격 항목 위조 차단(먼 미래 시각·형식 오류·이상한 id)', () => {
  const now = Date.parse('2026-11-25T12:00:00Z');
  const bad = [
    T('a', '9999'),
    T('b', '9999-01-01T00:00:00Z'),
    T('c', '2026-11-22T10:00:00Z', { deletedAt: '9999-01-01T00:00:00Z' }),
    T('d', '2026-11-22T10:00:00Z', { date: '2026-13-01' }),
    T('../x', '2026-11-22T10:00:00Z'),
    { ...T('e', '2026-11-22T10:00:00Z'), done: 'yes' },
    { ...T('f', '2026-11-22T10:00:00Z'), order: 'NaN' },
  ];
  // 위조·형식 오류 항목은 받아들이지도, 버린 채 덮어쓰지도 않고 멈춘다
  for (const b of bad) assert.throws(() => parseSyncFile(file([T('ok', '2026-11-25T10:00:00Z'), b]), now), /읽을 수 없는 업무가 1개/);
  const long = parseSyncFile(file([T('g', '2026-11-25T10:00:00Z', { title: 'x'.repeat(50000) })]), now);
  assert.equal(long.tasks[0].title.length, 5000);
});

test('파일 검사: 새 앱이 붙인 단순 필드는 보존, 객체·배열은 버림', () => {
  const f = parseSyncFile(file([{ ...T('a', '2026-11-25T10:00:00Z'), color: 'blue', pinned: true, meta: { x: 1 }, tags: ['a'] }]));
  const t = f.tasks[0] as unknown as Record<string, unknown>;
  assert.equal(t.color, 'blue');
  assert.equal(t.pinned, true);
  assert.equal(t.meta, undefined);
  assert.equal(t.tags, undefined);
});

test('설정 검사: 경로 조작 차단', () => {
  const ok = { owner: 'me', repo: 'data', branch: 'main', path: 'worklog/tasks.json' };
  assert.equal(validateConfig(ok), null);
  assert.ok(validateConfig({ ...ok, owner: '../x' }));
  assert.ok(validateConfig({ ...ok, repo: 'a/b' }));
  assert.ok(validateConfig({ ...ok, path: '../secret.json' }));
  assert.ok(validateConfig({ ...ok, path: '/abs.json' }));
  assert.ok(validateConfig({ ...ok, path: 'data.txt' }));
  assert.ok(validateConfig({ ...ok, branch: 'a b' }));
});

// ---- fetch 를 가짜로 바꿔 GitHub 흉내 ----
interface FakeOpts { conflicts?: number; isPrivate?: boolean; empty?: boolean; branch?: string }
function fakeGitHub(initial: string | null, o: FakeOpts = {}) {
  let content = initial;
  let sha: string | null = initial ? 'sha1' : null;
  let conflicts = o.conflicts ?? 0;
  let empty = !!o.empty;
  const branch = o.branch ?? 'main';
  const calls: { method: string; url: string; auth?: string; body?: any }[] = [];
  (globalThis as any).fetch = async (url: string, init: any = {}) => {
    const method = init.method ?? 'GET';
    const body = init.body ? JSON.parse(init.body) : undefined;
    calls.push({ method, url, auth: init.headers?.Authorization, body });
    const res = (status: number, b: any) => ({ ok: status < 300, status, json: async () => b });
    const path = url.replace('https://api.github.com', '');
    if (path.includes('/contents/') && method === 'GET') {
      if (empty || !content) return res(404, {});
      return res(200, { type: 'file', sha, size: content.length, content: Buffer.from(content).toString('base64').replace(/(.{60})/g, '$1\n') });
    }
    if (path.includes('/contents/') && method === 'PUT') {
      if (conflicts > 0) { conflicts--; sha = 'sha-other' + conflicts; return res(409, {}); }
      if (empty && body.branch) return res(404, {});
      if ((body.sha ?? null) !== sha) return res(409, {});
      content = Buffer.from(body.content, 'base64').toString('utf8');
      sha = 'sha' + Math.random();
      empty = false;
      return res(201, { content: { sha } });
    }
    if (/\/branches\?/.test(path)) return res(200, empty ? [] : [{ name: branch }]);
    if (/\/branches\//.test(path)) return empty || !path.endsWith('/' + branch) ? res(404, {}) : res(200, {});
    return res(200, { permissions: { push: true }, private: o.isPrivate ?? true, default_branch: 'main' });
  };
  return { calls, get content() { return content; } };
}
const cfg = { owner: 'me', repo: 'data', branch: 'main', path: 'worklog/tasks.json' };

test('sync: 첫 동기화는 파일 생성, 토큰은 헤더에만', async () => {
  const gh = fakeGitHub(null);
  const r = await sync(cfg, 'TOKEN123', [T('a', '2026-11-25T10:00:00Z', { title: '회의 준비 ✅' })]);
  assert.equal(r.pushed, true);
  const saved = JSON.parse(gh.content!);
  assert.equal(saved.version, 2);
  assert.equal(saved.tasks[0].title, '회의 준비 ✅');
  assert.ok(!gh.content!.includes('TOKEN123'), '파일에 토큰이 들어가면 안 됨');
  assert.ok(gh.calls.every((c) => c.auth === 'Bearer TOKEN123'));
  assert.ok(gh.calls.every((c) => !c.url.includes('TOKEN123')));
});

test('sync: 원격 변경을 받아오고, 바뀐 게 없으면 안 올림', async () => {
  const gh = fakeGitHub(file([T('b', '2026-11-25T01:00:00Z')]));
  const r = await sync(cfg, 't', []);
  assert.equal(r.tasks.length, 1);
  assert.equal(r.pulled, 1);
  assert.equal(r.pushed, false);
  assert.equal(gh.calls.filter((c) => c.method === 'PUT').length, 0);
});

test('sync: 충돌(409)이 두 번 나도 다시 받아 합쳐 올림', async () => {
  const gh = fakeGitHub(file([]), { conflicts: 2 });
  const r = await sync(cfg, 't', [T('a', '2026-11-25T10:00:00Z')]);
  assert.equal(r.pushed, true);
  assert.equal(gh.calls.filter((c) => c.method === 'PUT').length, 3);
});

test('sync: 충돌이 계속되면 충돌 안내(일반 오류 문구 아님)', async () => {
  fakeGitHub(file([]), { conflicts: 99 });
  await assert.rejects(sync(cfg, 't', [T('a', '2026-11-25T10:00:00Z')]), /동시에 저장/);
});

test('sync: 공개 저장소면 올리지 않음(자동 동기화 포함)', async () => {
  const gh = fakeGitHub(null, { isPrivate: false });
  await assert.rejects(sync(cfg, 't', [T('a', '2026-11-25T10:00:00Z')]), /공개 저장소/);
  assert.equal(gh.calls.filter((c) => c.method === 'PUT').length, 0);
});

test('sync: 커밋 없는 빈 저장소도 첫 동기화 가능', async () => {
  const gh = fakeGitHub(null, { empty: true });
  const info = await testConnection(cfg, 't');
  assert.equal(info.emptyRepo, true);
  assert.equal(info.branchExists, true);
  const r = await sync(cfg, 't', [T('a', '2026-11-25T10:00:00Z')]);
  assert.equal(r.pushed, true);
  assert.ok(gh.content);
});

test('sync: 없는 브랜치는 막음', async () => {
  fakeGitHub(null, { branch: 'dev' });
  await assert.rejects(sync(cfg, 't', [T('a', '2026-11-25T10:00:00Z')]), /브랜치/);
});

test('sync: 원격 파일 형식이 다르면 덮어쓰지 않음', async () => {
  const gh = fakeGitHub('{"something":"else"}');
  await assert.rejects(sync(cfg, 't', [T('a', '2026-11-25T10:00:00Z')]), /형식/);
  assert.equal(gh.calls.filter((c) => c.method === 'PUT').length, 0);
  assert.equal(gh.content, '{"something":"else"}');
});
