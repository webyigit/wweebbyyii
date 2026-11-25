import React, { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Linking, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useStore } from '../lib/store';
import { clearToken, getToken, setToken, tokenPersists } from '../lib/secure';
import { GitHubError, sync, testConnection, validateConfig } from '../lib/github';
import { fmtTime } from '../lib/dates';
import { Button, Field } from '../components/ui';
import { C, R } from '../theme';

type Msg = { kind: 'ok' | 'err' | 'info'; text: string } | null;

export default function SettingsScreen() {
  const store = useStore();
  const [cfg, setCfg] = useState(store.config);
  const [token, setTokenInput] = useState('');
  const [hasToken, setHasToken] = useState(false);
  const [busy, setBusy] = useState<null | 'test' | 'sync'>(null);
  const [msg, setMsg] = useState<Msg>(null);

  useEffect(() => { setCfg(store.config); }, [store.config]);
  useEffect(() => { getToken().then((t) => setHasToken(!!t)); }, []);

  /** 입력값 저장 + 토큰 확보. 문제 있으면 null */
  const prepare = async (): Promise<string | null> => {
    const c = { owner: cfg.owner.trim(), repo: cfg.repo.trim(), branch: cfg.branch.trim(), path: cfg.path.trim() };
    const bad = validateConfig(c);
    if (bad) { setMsg({ kind: 'err', text: bad }); return null; }
    await store.setConfig(c);
    let t = token.trim();
    if (t) {
      await setToken(t);
      setTokenInput('');
      setHasToken(true);
    } else {
      t = (await getToken()) ?? '';
    }
    if (!t) { setMsg({ kind: 'err', text: 'GitHub 토큰을 넣어 주세요.' }); return null; }
    return t;
  };

  const run = async (kind: 'test' | 'sync') => {
    if (busy) return;
    setMsg(null);
    setBusy(kind);
    try {
      const t = await prepare();
      if (!t) return;
      if (kind === 'test') {
        const info = await testConnection(cfg, t);
        if (!info.canWrite) setMsg({ kind: 'err', text: '저장소는 보이지만 쓰기 권한이 없습니다. 토큰에 Contents 읽기/쓰기를 주세요.' });
        else if (!info.branchExists) setMsg({ kind: 'err', text: `브랜치 '${cfg.branch}' 가 없습니다.` });
        else setMsg({ kind: info.isPrivate ? 'ok' : 'info', text: info.isPrivate ? '연결됨 · 비공개 저장소입니다.' : '연결됨 · 단, 공개 저장소라 누구나 기록을 볼 수 있습니다. 비공개 저장소를 권장합니다.' });
      } else {
        const r = await sync(cfg, t, store.all);
        await store.replaceAll(r.entries);
        const now = new Date().toISOString();
        await store.setLastSync(now);
        setMsg({ kind: 'ok', text: `동기화 완료 · 받아온 변경 ${r.pulled}건${r.pushed ? ' · 저장소에 올림' : ' · 올릴 변경 없음'}` });
      }
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
          기록은 이 기기에 먼저 저장됩니다. 아래를 채우고 '지금 동기화'를 누르면 GitHub 저장소의 JSON 파일과 합쳐서 양쪽을 같게 맞춥니다.
          같은 기록은 나중에 고친 쪽이 남습니다.
        </Text>

        <Field label="소유자 (GitHub 계정)" value={cfg.owner} onChangeText={set('owner')} autoCapitalize="none" autoCorrect={false} placeholder="예: my-account" testID="g-owner" />
        <Field label="저장소" value={cfg.repo} onChangeText={set('repo')} autoCapitalize="none" autoCorrect={false} placeholder="예: worklog-data (비공개 권장)" testID="g-repo" />
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
          토큰 만들기: Fine-grained 토큰 → 그 저장소만 선택 → Contents 읽기/쓰기
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
          마지막 동기화: {store.lastSync ? fmtTime(store.lastSync) : '아직 없음'} · 기록 {store.entries.length}개
        </Text>
        {hasToken && <Button title="이 기기에서 토큰 지우기" kind="danger" onPress={forget} style={{ marginTop: 20 }} testID="g-forget" />}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const st = StyleSheet.create({
  h1: { fontSize: 22, fontWeight: '800', color: C.text, marginBottom: 8 },
  p: { fontSize: 15, color: C.sub, lineHeight: 22, marginBottom: 16 },
  small: { fontSize: 13, color: C.sub, lineHeight: 19 },
  link: { fontSize: 14, color: C.primary, marginTop: 8, textDecorationLine: 'underline', paddingVertical: 6 },
  btns: { flexDirection: 'row', gap: 10, marginTop: 16 },
  msg: { marginTop: 14, padding: 12, borderRadius: R, borderWidth: 1 },
  ok: { backgroundColor: '#EAF6EE', borderColor: '#B7E0C3' },
  err: { backgroundColor: '#FDECEC', borderColor: '#F3B9B9' },
  info: { backgroundColor: '#FFF6E0', borderColor: '#F0D58A' },
});
