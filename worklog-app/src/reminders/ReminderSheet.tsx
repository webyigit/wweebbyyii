/**
 * 업무 행 우측 알림 버튼을 누르면 뜨는 바닥 시트 (토스 스타일: 큰 제목 · 알약 선택지 · 하단 꽉 찬 버튼)
 * 저장은 taskStore.update(id, { remindAt }) 로만 합니다. 기기 예약은 bridge 가 따라 맞춥니다.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { taskStore } from '../data/taskStore';
import { C, HIT } from '../theme';
import type { Task } from '../types';
import { defaultCustom, fmtClock, fmtRemind, parseDayKey, presetsFor, toDayKey } from './logic';
import { ensurePermission, getPermission, type PermissionState } from './notifications';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
const MINUTE_STEP = 5;

interface Props {
  task: Task;
  visible: boolean;
  onClose: () => void;
}

function initialSel(task: Task): Date {
  if (task.remindAt && Date.parse(task.remindAt) > Date.now()) return new Date(task.remindAt);
  const d = defaultCustom(task);
  const x = parseDayKey(d.date);
  x.setHours(d.hour, d.minute, 0, 0);
  return x;
}

/** 직접 고르기의 날짜 선택지: 업무 날 기준 전날·당일·다음날 중 오늘 이후만 */
function dayOptions(task: Task, now: Date): { key: string; label: string }[] {
  const today = toDayKey(now);
  const base = task.date < today ? parseDayKey(today) : parseDayKey(task.date);
  const out: { key: string; label: string }[] = [];
  for (const off of [-1, 0, 1]) {
    const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + off);
    const k = toDayKey(d);
    if (k < today) continue;
    const name = k === today ? '오늘' : k === toDayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)) ? '내일' : `${d.getMonth() + 1}/${d.getDate()}`;
    out.push({ key: k, label: `${name} (${WEEKDAYS[d.getDay()]})` });
  }
  return out;
}

export default function ReminderSheet({ task, visible, onClose }: Props) {
  const [sel, setSel] = useState<Date>(() => initialSel(task));
  const [perm, setPerm] = useState<PermissionState>('granted');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setSel(initialSel(task));
    setError(null);
    getPermission().then(setPerm).catch(() => setPerm('unsupported'));
  }, [visible, task.id, task.remindAt]);

  const now = new Date();
  const presets = useMemo(() => presetsFor(task, now), [task.date, visible]); // eslint-disable-line react-hooks/exhaustive-deps
  const days = useMemo(() => dayOptions(task, now), [task.date, visible]); // eslint-disable-line react-hooks/exhaustive-deps
  const selDay = toDayKey(sel);
  const hasReminder = !!task.remindAt;

  const setDay = (k: string) => {
    const d = parseDayKey(k);
    d.setHours(sel.getHours(), sel.getMinutes(), 0, 0);
    setSel(d);
    setError(null);
  };
  const stepHour = (n: number) => {
    const d = new Date(sel);
    d.setHours((sel.getHours() + n + 24) % 24);
    setSel(d);
    setError(null);
  };
  const stepMinute = (n: number) => {
    const d = new Date(sel);
    // 5분 단위로 맞춰 가며 이동, 시는 그대로(0↔55 순환)
    const m = Math.round(sel.getMinutes() / MINUTE_STEP) * MINUTE_STEP;
    d.setMinutes((m + n * MINUTE_STEP + 60) % 60);
    setSel(d);
    setError(null);
  };
  const toggleAmPm = () => stepHour(sel.getHours() < 12 ? 12 : -12);

  async function save() {
    if (sel.getTime() <= Date.now()) {
      setError('이미 지난 시각이에요. 다른 시각을 골라 주세요.');
      return;
    }
    setSaving(true);
    try {
      const p = await ensurePermission();
      setPerm(p);
      await taskStore.update(task.id, { remindAt: sel.toISOString() });
      onClose();
    } catch {
      setError('알림을 저장하지 못했어요. 다시 눌러 주세요.');
    } finally {
      setSaving(false);
    }
  }

  async function turnOff() {
    try {
      await taskStore.update(task.id, { remindAt: undefined });
      onClose();
    } catch {
      setError('알림을 끄지 못했어요. 다시 눌러 주세요.');
    }
  }

  const h = sel.getHours();
  const h12 = h % 12 === 0 ? 12 : h % 12;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={st.wrap}>
        <Pressable style={st.scrim} onPress={onClose} accessibilityRole="button" accessibilityLabel="닫기" testID="reminder-scrim" />
        <SafeAreaView edges={['bottom']} style={st.sheet} testID="reminder-sheet">
          <View style={st.grabber} />
          <ScrollView contentContainerStyle={st.body} bounces={false}>
            <Text style={st.h} accessibilityRole="header">언제 알려 드릴까요?</Text>
            <Text style={st.taskTitle}>{task.title}</Text>
            <Text style={st.status} testID="reminder-status">
              {hasReminder ? `${fmtRemind(task.remindAt!)}에 알려 드려요` : '아직 알림이 없어요'}
            </Text>

            {presets.length > 0 && (
              <View style={st.row} accessibilityRole="radiogroup" accessibilityLabel="빠른 선택">
                {presets.map((p) => {
                  const on = Math.abs(Date.parse(p.remindAt) - sel.getTime()) < 60000;
                  return (
                    <Chip key={p.key} label={p.label} on={on} testID={`preset-${p.key}`}
                      onPress={() => { setSel(new Date(p.remindAt)); setError(null); }} />
                  );
                })}
              </View>
            )}

            <Text style={st.section}>직접 고르기</Text>
            <View style={st.row} accessibilityRole="radiogroup" accessibilityLabel="날짜">
              {days.map((d) => (
                <Chip key={d.key} label={d.label} on={d.key === selDay} onPress={() => setDay(d.key)} testID={`day-${d.key}`} />
              ))}
            </View>

            <View style={st.timeRow}>
              <Pressable onPress={toggleAmPm} style={st.ampm} accessibilityRole="button"
                accessibilityLabel={`${h < 12 ? '오전' : '오후'}, 눌러서 바꾸기`} testID="ampm">
                <Text style={st.ampmText}>{h < 12 ? '오전' : '오후'}</Text>
              </Pressable>
              <Stepper value={String(h12)} unit="시" onMinus={() => stepHour(-1)} onPlus={() => stepHour(1)} testID="hour" />
              <Stepper value={String(Math.round(sel.getMinutes())).padStart(2, '0')} unit="분"
                onMinus={() => stepMinute(-1)} onPlus={() => stepMinute(1)} testID="minute" />
            </View>
            <Text style={st.preview} testID="reminder-preview">{fmtRemind(sel.toISOString())}</Text>

            {error && <Text style={st.error} accessibilityLiveRegion="polite">{error}</Text>}
            {perm === 'denied' && (
              <View style={st.notice}>
                <Text style={st.noticeText}>알림이 꺼져 있어 시각은 저장되지만 알림은 오지 않아요.</Text>
                <Pressable onPress={() => Linking.openSettings()} accessibilityRole="link" style={st.noticeBtn}>
                  <Text style={st.noticeLink}>설정에서 알림 켜기</Text>
                </Pressable>
              </View>
            )}
            {perm === 'unsupported' && (
              <Text style={st.noticeText}>
                {Platform.OS === 'web' ? '웹에서는 알림이 울리지 않아요. 휴대폰 앱에서 같은 시각에 알려 드려요.' : '이 기기에서는 알림을 받을 수 없어요.'}
              </Text>
            )}
          </ScrollView>

          <View style={st.footer}>
            {hasReminder && (
              <Pressable onPress={turnOff} style={[st.cta, st.ctaGhost]} accessibilityRole="button" testID="reminder-off">
                <Text style={[st.ctaText, { color: C.sub }]}>알림 끄기</Text>
              </Pressable>
            )}
            <Pressable onPress={save} disabled={saving} style={({ pressed }) => [st.cta, st.ctaPrimary, (pressed || saving) && { opacity: 0.8 }]}
              accessibilityRole="button" accessibilityState={{ disabled: saving }} testID="reminder-save">
              <Text style={[st.ctaText, { color: '#fff' }]}>{fmtClock(sel)}에 알림 받기</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

function Chip({ label, on, onPress, testID }: { label: string; on: boolean; onPress: () => void; testID?: string }) {
  return (
    <Pressable onPress={onPress} style={[st.chip, on && st.chipOn]} accessibilityRole="radio"
      accessibilityState={{ checked: on }} aria-checked={on} testID={testID}>
      <Text style={[st.chipText, on && st.chipTextOn]}>{label}</Text>
    </Pressable>
  );
}

function Stepper({ value, unit, onMinus, onPlus, testID }: { value: string; unit: string; onMinus: () => void; onPlus: () => void; testID: string }) {
  return (
    <View style={st.stepper} accessibilityRole="adjustable" accessibilityLabel={`${value}${unit}`}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => (e.nativeEvent.actionName === 'increment' ? onPlus() : onMinus())}>
      <Pressable onPress={onMinus} style={st.stepBtn} accessibilityRole="button" accessibilityLabel={`${unit} 줄이기`} testID={`${testID}-minus`}>
        <Text style={st.stepBtnText}>−</Text>
      </Pressable>
      <Text style={st.stepValue} testID={`${testID}-value`}>{value}<Text style={st.stepUnit}>{unit}</Text></Text>
      <Pressable onPress={onPlus} style={st.stepBtn} accessibilityRole="button" accessibilityLabel={`${unit} 늘리기`} testID={`${testID}-plus`}>
        <Text style={st.stepBtnText}>+</Text>
      </Pressable>
    </View>
  );
}

const st = StyleSheet.create({
  wrap: { flex: 1, justifyContent: 'flex-end' },
  scrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.56)' },
  sheet: { backgroundColor: C.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '88%' },
  grabber: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: C.line, marginTop: 8 },
  body: { paddingHorizontal: 24, paddingTop: 16, paddingBottom: 8 },
  h: { fontSize: 22, fontWeight: '700', color: C.text, letterSpacing: -0.3 },
  taskTitle: { fontSize: 15, color: C.sub, marginTop: 6, lineHeight: 22 },
  status: { fontSize: 15, color: C.blueText, fontWeight: '600', marginTop: 12 },
  section: { fontSize: 13, fontWeight: '600', color: C.sub, marginTop: 24, marginBottom: 4 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  chip: { minHeight: HIT, paddingHorizontal: 16, borderRadius: 999, backgroundColor: C.greyBg, borderWidth: 1, borderColor: C.grey300, justifyContent: 'center' },
  chipOn: { backgroundColor: C.blue50, borderColor: C.blue },
  chipText: { fontSize: 15, fontWeight: '600', color: C.text },
  chipTextOn: { color: C.blueText },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 16 },
  ampm: { minHeight: HIT + 4, minWidth: 64, borderRadius: 14, backgroundColor: C.greyBg, alignItems: 'center', justifyContent: 'center' },
  ampmText: { fontSize: 17, fontWeight: '700', color: C.text },
  stepper: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: C.greyBg, borderRadius: 14, minHeight: HIT + 4 },
  stepBtn: { width: HIT, height: HIT, alignItems: 'center', justifyContent: 'center' },
  stepBtnText: { fontSize: 22, color: C.blueText, fontWeight: '600' },
  stepValue: { fontSize: 20, fontWeight: '700', color: C.text, fontVariant: ['tabular-nums'] },
  stepUnit: { fontSize: 15, fontWeight: '600', color: C.sub },
  preview: { fontSize: 15, color: C.sub, marginTop: 12 },
  error: { fontSize: 14, color: C.danger, marginTop: 12 },
  notice: { marginTop: 12, padding: 12, borderRadius: 12, backgroundColor: C.greyBg },
  noticeText: { fontSize: 14, color: C.sub, lineHeight: 20, marginTop: 12 },
  noticeBtn: { minHeight: HIT, justifyContent: 'center' },
  noticeLink: { fontSize: 15, fontWeight: '700', color: C.blueText },
  footer: { flexDirection: 'row', gap: 8, paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12 },
  cta: { flex: 1, minHeight: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  ctaPrimary: { backgroundColor: C.primary, flex: 2 },
  ctaGhost: { backgroundColor: C.greyBg },
  ctaText: { fontSize: 17, fontWeight: '700' },
});
