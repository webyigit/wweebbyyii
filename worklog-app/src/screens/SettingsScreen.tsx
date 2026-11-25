import React, { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Linking, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { clearToken, getToken, setToken, tokenPersists } from '../lib/secure';
import { GitHubError, testConnection, validateConfig } from '../lib/github';
import { DEFAULT_CONFIG, loadConfig, loadLastSync, saveConfig, syncNow } from '../lib/syncService';
import { useTasks } from '../data/useTasks';
import { Button, Field } from '../components/ui';
import { C, R } from '../theme';
import type { GitHubConfig } from '../types';

type Msg = { kind: 'ok' | 'err' | 'info'; text: string } | null;

const pad = (n: number) => String(n).padStart(2, '0');
const fmtTime = (iso: string) => {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export default function SettingsScreen() {
  const tasks = useTasks();
  const [cfg, setCfg] = useState<GitHubConfig>(DEFAULT_CONFIG);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [token, setTokenInput] = useState('');
  const [hasToken, setHasToken] = useState(false);
  const [busy, setBusy] = useState<null | 'test' | 'sync'>(null);
  const [msg, setMsg] = useState<Msg>(null);

  useEffect(() => {
    loadConfig().then(setCfg);
    loadLastSync().then(setLastSync);
    getToken().then((t) => setHasToken(!!t));
  }, []);

  /** 입력값 검사·저장 + 토큰 확보. 문제 있으면 null. 검사한 값(c)만 이후에 쓴다 */
  const prepare = async (): Promise<{ c: GitHubConfig; t: string; isNew: boolean } | null> => {
    const c = { owner: cfg.owner.trim(), repo: cfg.repo.trim(), branch: cfg.branch.trim(), path: cfg.path.trim() };
    const bad = validateConfig(c);
    if (bad) { setMsg({ kind: 'err', text: bad }); return null; }
    await saveConfig(c);
    const typed = token.trim();
    const t = typed || (await getToken()) || '';
    if (!t) { setMsg({ kind: 'err', text: 'GitHub 토큰을 넣어 주세요.' }); return null; }
    return { c, t, isNew: !!typed };
  };

  const run = async (kind: 'test' | 'sync') => {
    if (busy) return;
    setMsg(null);
    setBusy(kind);
    try {
      const p = await prepare();
      if (!p) return;
      const { c, t } = p;
      // 연결부터 확인: 권한·브랜치·공개 여부. 공개 저장소면 기록이 누구에게나 보이므로 동기화를 막는다
      const info = await testConnection(c, t);
      // 토큰은 GitHub 가 받아 준 뒤에만 보안 저장소에 넣는다(틀린 토큰이 '저장됨'으로 남지 않게)
      if (p.isNew) {
        await setToken(t);
        setTokenInput('');
        setHasToken(true);
      }
      if (!info.canWrite) { setMsg({ kind: 'err', text: '저장소는 보이지만 쓰기 권한이 없습니다. 토큰에 Contents 읽기/쓰기를 주세요.' }); return; }
      if (!info.branchExists) { setMsg({ kind: 'err', text: `브랜치 '${c.branch}' 가 없습니다.` }); return; }
      if (!info.isPrivate) {
        setMsg({ kind: 'err', text: '공개 저장소입니다. 업무 기록이 누구에게나 보이므로 동기화하지 않았습니다. 비공개(private) 저장소를 지정하세요.' });
        return;
      }
      if (kind === 'test') {
        setMsg({ kind: 'ok', text: '연결됨 · 비공개 저장소, 쓰기 권한 확인.' });
        return;
      }
      const r = await syncNow(c, t);
      setLastSync(await loadLastSync());
      setMsg({ kind: 'ok', text: `동기화 완료 · 받아온 변경 ${r.pulled}건${r.pushed ? ' · 저장소에 올림' : ' · 올릴 변경 없음'}` });
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof GitHubError ? e.message : '알 수 없는 오류가 났습니다. 다시 시도하세요.' });
    } finally {
      setBusy(null);
    }
  };

  const forget = async () => {
    await clearToken();
    setHasToken(false);
    setMsg({ kind: 'info', text: '이 기기에서 토큰을 지웠습니다.' });
  };

  const set = (k: keyof typeof cfg) => (v: string) => setCfg({ ...cfg, [k]: v });

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
        <Text style={st.h1} accessibilityRole="header">GitHub 저장</Text>
        <Text style={st.p}>
          업무는 이 기기에 먼저 저장돼요. 아래를 채우고 '지금 동기화'를 누르면 GitHub 비공개 저장소의 JSON 파일과 합쳐서 양쪽을 같게 맞춰요.
          새 기기에서는 같은 설정으로 동기화하면 그대로 불러와요. 같은 업무를 두 기기에서 고쳤다면 나중에 고친 쪽이 남아요.
        </Text>

        <Field label="소유자 (GitHub 계정)" value={cfg.owner} onChangeText={set('owner')} autoCapitalize="none" autoCorrect={false} placeholder="예: my-account" testID="g-owner" />
        <Field label="저장소" value={cfg.repo} onChangeText={set('repo')} autoCapitalize="none" autoCorrect={false} placeholder="예: worklog-data (비공개 저장소)" testID="g-repo" />
        <Field label="브랜치" value={cfg.branch} onChangeText={set('branch')} autoCapitalize="none" autoCorrect={false} testID="g-branch" />
        <Field label="파일 경로" value={cfg.path} onChangeText={set('path')} autoCapitalize="none" autoCorrect={false} testID="g-path" />
        <Field
          label={hasToken ? '토큰 (저장됨 · 바꿀 때만 입력)' : '토큰'}
          value={token}
          onChangeText={setTokenInput}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
          textContentType="password"
          placeholder={hasToken ? '••••••••' : 'github_pat_…'}
          testID="g-token"
        />
        <Text style={st.small}>
          {tokenPersists
            ? '토큰은 기기 보안 저장소(키체인)에만 저장되고, 저장소나 기록 파일에는 들어가지 않습니다.'
            : '웹 미리보기에서는 토큰을 저장하지 않습니다(새로고침하면 다시 입력).'}
        </Text>
        <Text
          style={st.link}
          accessibilityRole="link"
          onPress={() => Linking.openURL('https://github.com/settings/personal-access-tokens/new')}
        >
          토큰 만들기: Fine-grained 토큰 → 그 저장소만 선택 → Contents 읽기/쓰기 · 만료는 90일 이내 권장
        </Text>

        <View style={st.btns}>
          <Button title="연결 확인" kind="ghost" onPress={() => run('test')} disabled={!!busy} style={{ flex: 1 }} testID="g-test" />
          <Button title="지금 동기화" onPress={() => run('sync')} disabled={!!busy} style={{ flex: 1 }} testID="g-sync" />
        </View>
        {busy && <ActivityIndicator style={{ marginTop: 12 }} accessibilityLabel={busy === 'sync' ? '동기화 중' : '확인 중'} />}
        {msg && (
          <View style={[st.msg, msg.kind === 'ok' ? st.ok : msg.kind === 'err' ? st.err : st.info]} accessibilityLiveRegion="polite" testID="g-msg">
            <Text style={{ color: C.text, fontSize: 15 }}>{msg.text}</Text>
          </View>
        )}
        <Text style={[st.small, { marginTop: 12 }]} testID="g-last">
          마지막 동기화: {lastSync ? fmtTime(lastSync) : '아직 없음'} · 업무 {tasks.length}개
        </Text>
        {hasToken && <Button title="이 기기에서 토큰 지우기" kind="danger" onPress={forget} style={{ marginTop: 20 }} testID="g-forget" />}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const st = StyleSheet.create({
  h1: { fontSize: 22, fontWeight: '700', color: C.text, marginBottom: 8, letterSpacing: -0.3 },
  p: { fontSize: 15, color: C.sub, lineHeight: 22, marginBottom: 16 },
  small: { fontSize: 13, color: C.sub, lineHeight: 19 },
  link: { fontSize: 14, color: C.primary, marginTop: 8, textDecorationLine: 'underline', paddingVertical: 6 },
  btns: { flexDirection: 'row', gap: 10, marginTop: 16 },
  msg: { marginTop: 14, padding: 12, borderRadius: R.m, borderWidth: 1 },
  // 토스 톤: 옅은 면 + 테두리 없음에 가깝게
  ok: { backgroundColor: '#E8F3FF', borderColor: '#E8F3FF' },
  err: { backgroundColor: '#FFEEEE', borderColor: '#FFEEEE' },
  info: { backgroundColor: '#F2F4F6', borderColor: '#F2F4F6' },
});
