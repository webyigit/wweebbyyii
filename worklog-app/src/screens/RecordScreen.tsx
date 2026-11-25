import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { Period } from '../types';
import { PERIOD_LABEL } from '../types';
import { useStore } from '../lib/store';
import { dateFromKey, daysIn, keyFor, label, labelFromKey, shift, toDayKey } from '../lib/dates';
import { Button, Field, Segmented } from '../components/ui';
import { C, HIT, R } from '../theme';

type Fields = { done: string; todo: string; memo: string };
const EMPTY: Fields = { done: '', todo: '', memo: '' };

const PLACEHOLDER: Record<Period, Fields> = {
  daily: { done: '오늘 한 일', todo: '내일 할 일', memo: '이슈·메모' },
  weekly: { done: '이번 주 성과', todo: '다음 주 계획', memo: '회고·이슈' },
  monthly: { done: '이번 달 성과', todo: '다음 달 목표', memo: '회고·배운 점' },
};
const TITLES: Record<Period, Fields> = {
  daily: { done: '한 일', todo: '할 일', memo: '메모' },
  weekly: { done: '이번 주 한 일', todo: '다음 주 할 일', memo: '회고' },
  monthly: { done: '이번 달 한 일', todo: '다음 달 할 일', memo: '회고' },
};

export default function RecordScreen({
  period, date, onPeriod, onDate,
}: { period: Period; date: Date; onPeriod: (p: Period) => void; onDate: (d: Date) => void }) {
  const store = useStore();
  const key = keyFor(period, date);
  const entry = store.get(period, key);
  const id = `${period}:${key}`;
  // 입력 중인 내용만 draft 에 두고, 아니면 저장된 기록을 그대로 보여 준다.
  // (기간을 바꾼 첫 화면부터 바로 맞는 내용이 보이도록 effect 로 복사하지 않음)
  const [draft, setDraft] = useState<{ id: string; fields: Fields } | null>(null);
  const shown: Fields =
    draft && draft.id === id ? draft.fields : entry ? { done: entry.done, todo: entry.todo, memo: entry.memo } : EMPTY;
  const [status, setStatus] = useState<'idle' | 'dirty' | 'saved' | 'error'>('idle');
  const [showDays, setShowDays] = useState(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<{ period: Period; key: string; fields: Fields } | null>(null);

  const flush = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const p = pending.current;
    pending.current = null;
    if (!p) return;
    try {
      await store.save(p.period, p.key, p.fields);
      setStatus('saved');
      if (!pending.current) setDraft(null); // 저장 끝, 그 사이 새 입력이 없으면 저장본을 보여 줌
    } catch {
      setStatus('error');
    }
  }, [store.save]);

  // 기간이 바뀌면 쓰던 내용을 먼저 저장하고, 새 기간의 기록을 불러온다
  useEffect(() => {
    flush();
    setStatus('idle');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, key]);

  // 화면을 떠날 때 남은 내용 저장
  useEffect(() => () => { flush(); }, [flush]);

  const change = (k: keyof Fields, v: string) => {
    const next = { ...shown, [k]: v };
    setDraft({ id, fields: next });
    setStatus('dirty');
    pending.current = { period, key, fields: next };
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, 600);
  };

  const onDelete = () => {
    if (!entry) return;
    const go = async () => {
      pending.current = null;
      if (timer.current) clearTimeout(timer.current);
      await store.remove(entry.id);
      setDraft(null);
      setStatus('idle');
    };
    if (Platform.OS === 'web') {
      // 웹 미리보기용: Alert 버튼이 동작하지 않으므로 confirm 사용
      if ((globalThis as any).confirm?.('이 기록을 삭제할까요?')) go();
      return;
    }
    Alert.alert('기록 삭제', `${label(period, date)} 기록을 삭제할까요?`, [
      { text: '취소', style: 'cancel' },
      { text: '삭제', style: 'destructive', onPress: go },
    ]);
  };

  const isToday = keyFor(period, new Date()) === key;
  const dayEntries =
    period === 'daily'
      ? []
      : daysIn(period, date).map((k) => store.get('daily', k)).filter((e): e is NonNullable<typeof e> => !!e);

  const statusText =
    status === 'dirty' ? '입력 중…' : status === 'saved' ? '저장됨' : status === 'error' ? '저장 실패 · 다시 입력해 보세요' : entry ? '저장됨' : '';

  const t = TITLES[period];
  const ph = PLACEHOLDER[period];

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={st.wrap} keyboardShouldPersistTaps="handled">
        <Segmented
          label="기록 단위"
          value={period}
          onChange={async (p) => { await flush(); onPeriod(p); }}
          options={(['daily', 'weekly', 'monthly'] as Period[]).map((p) => ({ value: p, label: PERIOD_LABEL[p] }))}
        />

        <View style={st.nav}>
          <Pressable
            onPress={() => onDate(shift(period, date, -1))}
            style={st.arrow}
            accessibilityRole="button"
            accessibilityLabel={`이전 ${period === 'daily' ? '날' : period === 'weekly' ? '주' : '달'}`}
            testID="prev"
          >
            <Text style={st.arrowText}>‹</Text>
          </Pressable>
          <Text style={st.navLabel} accessibilityRole="header" testID="period-label">{label(period, date)}</Text>
          <Pressable
            onPress={() => onDate(shift(period, date, 1))}
            style={st.arrow}
            accessibilityRole="button"
            accessibilityLabel={`다음 ${period === 'daily' ? '날' : period === 'weekly' ? '주' : '달'}`}
            testID="next"
          >
            <Text style={st.arrowText}>›</Text>
          </Pressable>
        </View>
        <View style={st.row}>
          <Text style={[st.status, status === 'error' && { color: C.danger }]} accessibilityLiveRegion="polite" testID="save-status">
            {statusText}
          </Text>
          {!isToday && <Button title="오늘로" kind="ghost" onPress={() => onDate(new Date())} style={{ minHeight: 36 }} testID="today" />}
        </View>

        <Field label={t.done} placeholder={ph.done} value={shown.done} onChangeText={(v) => change('done', v)} multiline testID="f-done" />
        <Field label={t.todo} placeholder={ph.todo} value={shown.todo} onChangeText={(v) => change('todo', v)} multiline testID="f-todo" />
        <Field label={t.memo} placeholder={ph.memo} value={shown.memo} onChangeText={(v) => change('memo', v)} multiline testID="f-memo" />

        {entry && <Button title="이 기록 삭제" kind="danger" onPress={onDelete} testID="delete" />}

        {period !== 'daily' && (
          <View style={st.days}>
            <Pressable
              onPress={() => setShowDays((v) => !v)}
              style={st.daysHead}
              accessibilityRole="button"
              accessibilityState={{ expanded: showDays }}
              testID="toggle-days"
            >
              <Text style={st.daysTitle}>
                이 {period === 'weekly' ? '주' : '달'}의 일간 기록 {dayEntries.length}개
              </Text>
              <Text style={st.sub}>{showDays ? '접기' : '펼치기'}</Text>
            </Pressable>
            {showDays && dayEntries.length === 0 && <Text style={st.sub}>아직 일간 기록이 없습니다.</Text>}
            {showDays &&
              dayEntries.map((e) => (
                <Pressable
                  key={e.id}
                  onPress={async () => { await flush(); onPeriod('daily'); onDate(dateFromKey('daily', e.key)); }}
                  style={st.dayCard}
                  accessibilityRole="button"
                  accessibilityHint="그날 일간 기록으로 이동"
                >
                  <Text style={st.dayDate}>{labelFromKey('daily', e.key)}</Text>
                  {!!e.done && <Text style={st.dayText} numberOfLines={3}>• {e.done}</Text>}
                  {!!e.todo && <Text style={st.daySub} numberOfLines={2}>할 일: {e.todo}</Text>}
                </Pressable>
              ))}
          </View>
        )}
        <Text style={st.hint}>입력을 멈추면 자동으로 저장됩니다 · 오늘: {toDayKey(new Date())}</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const st = StyleSheet.create({
  wrap: { padding: 16, paddingBottom: 40 },
  nav: { flexDirection: 'row', alignItems: 'center', marginTop: 14 },
  arrow: { width: HIT, height: HIT, alignItems: 'center', justifyContent: 'center', borderRadius: R, backgroundColor: C.card },
  arrowText: { fontSize: 28, color: C.primary, lineHeight: 30 },
  navLabel: { flex: 1, textAlign: 'center', fontSize: 18, fontWeight: '800', color: C.text },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 40, marginVertical: 6 },
  status: { fontSize: 14, color: C.sub },
  days: { marginTop: 22, backgroundColor: C.card, borderRadius: R, padding: 12 },
  daysHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: HIT },
  daysTitle: { fontSize: 16, fontWeight: '800', color: C.text },
  dayCard: { borderTopWidth: 1, borderTopColor: C.line, paddingVertical: 10, minHeight: HIT },
  dayDate: { fontSize: 14, fontWeight: '700', color: C.primary, marginBottom: 2 },
  dayText: { fontSize: 15, color: C.text },
  daySub: { fontSize: 14, color: C.sub, marginTop: 2 },
  sub: { fontSize: 14, color: C.sub },
  hint: { marginTop: 18, fontSize: 13, color: C.sub, textAlign: 'center' },
});
