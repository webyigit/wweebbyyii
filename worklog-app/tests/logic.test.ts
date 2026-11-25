// 실행: npm test  (node 22 의 타입 제거 기능 사용, 별도 설치 없음)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { daysIn, dateFromKey, keyFor, label, shift, toDayKey, toWeekKey } from '../src/lib/dates';
import { decodeBase64, encodeBase64 } from '../src/lib/base64';
import { mergeEntries, parseSyncFile } from '../src/lib/merge';
import { sync, validateConfig } from '../src/lib/github';
import type { Entry } from '../src/types';

test('ISO 주 번호: 연말·연초 경계', () => {
  assert.equal(toWeekKey(new Date(2026, 10, 25)), '2026-W48');
  assert.equal(toWeekKey(new Date(2024, 11, 30)), '2025-W01'); // 월요일인데 다음 해 1주
  assert.equal(toWeekKey(new Date(2021, 0, 3)), '2020-W53'); // 일요일인데 전 해 53주
  assert.equal(toWeekKey(new Date(2026, 0, 1)), '2026-W01');
});

test('주 키 → 월요일 날짜 왕복', () => {
  for (const k of ['2026-W01', '2026-W48', '2020-W53', '2025-W01']) {
    const d = dateFromKey('weekly', k);
    assert.equal(d.getDay(), 1, k);
    assert.equal(toWeekKey(d), k);
  }
});

test('월 이동은 31일에서도 한 달씩', () => {
  const d = shift('monthly', new Date(2026, 0, 31), 1);
  assert.equal(keyFor('monthly', d), '2026-02');
  assert.equal(keyFor('monthly', shift('monthly', new Date(2026, 0, 15), -1)), '2025-12');
});

test('기간의 날짜 목록', () => {
  assert.equal(daysIn('weekly', new Date(2026, 10, 25)).length, 7);
  assert.equal(daysIn('weekly', new Date(2026, 10, 25))[0], '2026-11-23');
  assert.equal(daysIn('monthly', new Date(2026, 1, 10)).length, 28);
  assert.equal(daysIn('monthly', new Date(2028, 1, 10)).length, 29);
});

test('라벨', () => {
  assert.equal(label('daily', new Date(2026, 10, 25)), '2026년 11월 25일 (수)');
  assert.equal(label('weekly', new Date(2026, 10, 25)), '48주차 · 11/23~11/29');
  assert.equal(toDayKey(new Date(2026, 0, 5)), '2026-01-05');
});

test('base64: 한글·이모지 왕복, 표준 결과와 일치', () => {
  for (const s of ['', 'a', 'ab', 'abc', '업무 기록 ✅ 🚀', JSON.stringify({ x: '한 일\n할 일' })]) {
    const b = encodeBase64(s);
    assert.equal(b, Buffer.from(s, 'utf8').toString('base64'));
    assert.equal(decodeBase64(b), s);
  }
  // GitHub 는 60자마다 줄바꿈을 넣어 줌
  const long = '가'.repeat(200);
  const wrapped = Buffer.from(long).toString('base64').replace(/(.{60})/g, '$1\n');
  assert.equal(decodeBase64(wrapped), long);
});

const E = (id: string, updatedAt: string, extra: Partial<Entry> = {}): Entry => {
  const [period, key] = id.split(':') as [Entry['period'], string];
  return { id, period, key, done: id + updatedAt, todo: '', memo: '', updatedAt, ...extra };
};

test('합치기: 나중에 고친 쪽, 삭제 전달', () => {
  const a = [E('daily:2026-11-25', '2026-11-25T10:00:00Z'), E('daily:2026-11-24', '2026-11-24T09:00:00Z')];
  const b = [
    E('daily:2026-11-25', '2026-11-25T11:00:00Z'),
    E('daily:2026-11-24', '2026-11-24T08:00:00Z', { deletedAt: '2026-11-25T12:00:00Z' }),
    E('weekly:2026-W48', '2026-11-25T01:00:00Z'),
  ];
  const m = mergeEntries(a, b);
  assert.equal(m.length, 3);
  assert.equal(m.find((e) => e.id === 'daily:2026-11-25')!.updatedAt, '2026-11-25T11:00:00Z');
  assert.ok(m.find((e) => e.id === 'daily:2026-11-24')!.deletedAt);
  assert.deepEqual(mergeEntries(b, a), m); // 순서 무관
});

test('파일 검사: 다른 JSON 은 거부, 이상한 항목은 버림', () => {
  assert.throws(() => parseSyncFile('{"foo":1}'));
  assert.throws(() => parseSyncFile('not json'));
  const f = parseSyncFile(JSON.stringify({ app: 'worklog', entries: [E('daily:2026-11-25', '2026-11-25T10:00:00Z'), { id: 1 }, null] }));
  assert.equal(f.entries.length, 1);
});

test('보안: 원격 항목 위조 차단(id 불일치·먼 미래 시각·형식 오류)', () => {
  const bad = [
    { ...E('daily:2026-11-25', '2026-11-25T10:00:00Z'), period: 'weekly', key: 'garbage' }, // id 와 period·key 불일치
    E('daily:2026-11-24', '9999'), // 문자열 비교로 항상 이기는 값
    E('daily:2026-11-23', '9999-01-01T00:00:00Z'), // 먼 미래
    E('daily:2026-11-22', '2026-11-22T10:00:00Z', { deletedAt: '9999-01-01T00:00:00Z' }), // 영구 삭제 시도
    E('daily:2026-13-01', '2026-11-22T10:00:00Z'), // 없는 날짜 키
    E('weekly:2026-W60', '2026-11-22T10:00:00Z'),
  ];
  const f = parseSyncFile(JSON.stringify({ app: 'worklog', entries: bad }));
  assert.equal(f.entries.length, 0);
  // 정상 항목의 긴 글은 잘라서 받음
  const long = parseSyncFile(JSON.stringify({ app: 'worklog', entries: [E('monthly:2026-11', '2026-11-25T10:00:00Z', { memo: 'x'.repeat(50000) })] }));
  assert.equal(long.entries[0].memo.length, 20000);
});

test('설정 검사: 경로 조작 차단', () => {
  const ok = { owner: 'me', repo: 'data', branch: 'main', path: 'worklog/data.json' };
  assert.equal(validateConfig(ok), null);
  assert.ok(validateConfig({ ...ok, owner: '../x' }));
  assert.ok(validateConfig({ ...ok, repo: 'a/b' }));
  assert.ok(validateConfig({ ...ok, path: '../secret.json' }));
  assert.ok(validateConfig({ ...ok, path: '/abs.json' }));
  assert.ok(validateConfig({ ...ok, path: 'data.txt' }));
  assert.ok(validateConfig({ ...ok, branch: 'a b' }));
});

// ---- sync: fetch 를 가짜로 바꿔 GitHub 동작 흉내 ----
function fakeGitHub(initial: string | null, opts: { conflictOnce?: boolean } = {}) {
  let content = initial;
  let sha = initial ? 'sha1' : null;
  let conflict = !!opts.conflictOnce;
  const calls: { method: string; url: string; auth?: string; body?: any }[] = [];
  (globalThis as any).fetch = async (url: string, init: any = {}) => {
    const method = init.method ?? 'GET';
    calls.push({ method, url, auth: init.headers?.Authorization, body: init.body ? JSON.parse(init.body) : undefined });
    const res = (status: number, body: any) => ({ ok: status < 300, status, json: async () => body });
    if (url.includes('/contents/') && method === 'GET') {
      if (!content) return res(404, {});
      return res(200, { type: 'file', sha, content: Buffer.from(content).toString('base64').replace(/(.{60})/g, '$1\n') });
    }
    if (url.includes('/contents/') && method === 'PUT') {
      const b = JSON.parse(init.body);
      if (conflict) { conflict = false; sha = 'sha-other'; return res(409, {}); }
      if ((b.sha ?? null) !== sha) return res(409, {});
      content = Buffer.from(b.content, 'base64').toString('utf8');
      sha = 'sha' + Math.random();
      return res(200, {});
    }
    return res(200, { permissions: { push: true }, private: true });
  };
  return { calls, get content() { return content; } };
}
const cfg = { owner: 'me', repo: 'data', branch: 'main', path: 'worklog/data.json' };

test('sync: 첫 동기화는 파일 생성, 토큰은 헤더에만', async () => {
  const gh = fakeGitHub(null);
  const local = [E('daily:2026-11-25', '2026-11-25T10:00:00Z', { done: '회의 준비 ✅' })];
  const r = await sync(cfg, 'TOKEN123', local);
  assert.equal(r.pushed, true);
  const saved = JSON.parse(gh.content!);
  assert.equal(saved.entries[0].done, '회의 준비 ✅');
  assert.ok(!gh.content!.includes('TOKEN123'), '파일에 토큰이 들어가면 안 됨');
  assert.ok(gh.calls.every((c) => c.auth === 'Bearer TOKEN123'));
  assert.ok(gh.calls.every((c) => !c.url.includes('TOKEN123')));
});

test('sync: 원격 변경을 받아오고, 바뀐 게 없으면 안 올림', async () => {
  const remote = JSON.stringify({ app: 'worklog', version: 1, entries: [E('weekly:2026-W48', '2026-11-25T01:00:00Z')] });
  const gh = fakeGitHub(remote);
  const r = await sync(cfg, 't', []);
  assert.equal(r.entries.length, 1);
  assert.equal(r.pulled, 1);
  assert.equal(r.pushed, false);
  assert.equal(gh.calls.filter((c) => c.method === 'PUT').length, 0);
});

test('sync: 충돌(409) 나면 한 번 더 받아서 다시 올림', async () => {
  const remote = JSON.stringify({ app: 'worklog', version: 1, entries: [] });
  const gh = fakeGitHub(remote, { conflictOnce: true });
  const r = await sync(cfg, 't', [E('daily:2026-11-25', '2026-11-25T10:00:00Z')]);
  assert.equal(r.pushed, true);
  assert.equal(gh.calls.filter((c) => c.method === 'PUT').length, 2);
});
