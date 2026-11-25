import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button, Sheet } from './ui';
import { C, HIT, R } from '../theme';
import { parseDay, toDayKey, WEEKDAY } from '../lib/dates';

/** 년·월·일로 바로 이동하는 달력 시트. 년 ‹ ›, 월 ‹ ›, 일 칸 */
export default function DatePickerSheet({
  visible, value, onPick, onClose, title = '날짜 선택', countByDay,
}: {
  visible: boolean; value: string; onPick: (day: string) => void; onClose: () => void; title?: string;
  countByDay?: Record<string, number>;
}) {
  const [y, setY] = useState(0);
  const [m, setM] = useState(0);
  useEffect(() => {
    if (!visible) return;
    const d = parseDay(value);
    setY(d.getFullYear());
    setM(d.getMonth());
  }, [visible, value]);

  const first = new Date(y, m, 1).getDay();
  const last = new Date(y, m + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(first).fill(null), ...Array.from({ length: last }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);
  const today = toDayKey(new Date());
  const moveMonth = (n: number) => {
    const d = new Date(y, m + n, 1);
    setY(d.getFullYear());
    setM(d.getMonth());
  };

  return (
    <Sheet visible={visible} onClose={onClose} title={title} testID="date-sheet">
      <View style={s.head}>
        <Stepper label="년" text={`${y}년`} onPrev={() => setY(y - 1)} onNext={() => setY(y + 1)} testID="dp-year" />
        <Stepper label="월" text={`${m + 1}월`} onPrev={() => moveMonth(-1)} onNext={() => moveMonth(1)} testID="dp-month" />
      </View>
      <View style={s.week}>
        {WEEKDAY.map((w, i) => (
          <Text key={w} style={[s.wd, i === 0 && { color: C.redText }]}>{w}</Text>
        ))}
      </View>
      <View style={s.grid}>
        {cells.map((d, i) => {
          if (!d) return <View key={i} style={s.cell} />;
          const key = toDayKey(new Date(y, m, d));
          const on = key === value;
          const isToday = key === today;
          const n = countByDay?.[key] ?? 0;
          return (
            <Pressable
              key={i}
              style={s.cell}
              onPress={() => { onPick(key); onClose(); }}
              accessibilityRole="button"
              accessibilityLabel={`${m + 1}월 ${d}일${isToday ? ', 오늘' : ''}${n ? `, 업무 ${n}개` : ''}`}
              accessibilityState={{ selected: on }}
              testID={`dp-${key}`}
            >
              <View style={[s.day, on && s.dayOn, !on && isToday && s.dayToday]}>
                <Text style={[s.dayText, on && { color: '#fff', fontWeight: '700' }]}>{d}</Text>
              </View>
              {n > 0 && <View style={[s.dot, on && { backgroundColor: C.blue }]} />}
            </Pressable>
          );
        })}
      </View>
      <Button title="오늘로 가기" kind="grey" onPress={() => { onPick(today); onClose(); }} style={{ marginTop: 12 }} testID="dp-today" />
    </Sheet>
  );
}

function Stepper({ label, text, onPrev, onNext, testID }: { label: string; text: string; onPrev: () => void; onNext: () => void; testID: string }) {
  return (
    <View style={s.stepper}>
      <Pressable onPress={onPrev} style={s.arrow} accessibilityRole="button" accessibilityLabel={`이전 ${label}`} testID={`${testID}-prev`}>
        <Ionicons name="chevron-back" size={20} color={C.grey700} />
      </Pressable>
      <Text style={s.stepText} testID={testID}>{text}</Text>
      <Pressable onPress={onNext} style={s.arrow} accessibilityRole="button" accessibilityLabel={`다음 ${label}`} testID={`${testID}-next`}>
        <Ionicons name="chevron-forward" size={20} color={C.grey700} />
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  head: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  stepper: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: C.greyBg, borderRadius: R.l },
  arrow: { width: HIT, height: HIT, alignItems: 'center', justifyContent: 'center' },
  stepText: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '700', color: C.text },
  week: { flexDirection: 'row', marginTop: 4 },
  wd: { flex: 1, textAlign: 'center', fontSize: 13, color: C.grey600, paddingVertical: 6 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, height: 48, alignItems: 'center', justifyContent: 'center' },
  day: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  dayOn: { backgroundColor: C.blue },
  dayToday: { borderWidth: 1.5, borderColor: C.blue },
  dayText: { fontSize: 16, color: C.text },
  dot: { position: 'absolute', bottom: 2, width: 4, height: 4, borderRadius: 2, backgroundColor: C.grey400 },
});
