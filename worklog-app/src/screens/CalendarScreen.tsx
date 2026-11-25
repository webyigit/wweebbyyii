import React, { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Task, TaskFilter, ViewMode } from '../types';
import { useTasks } from '../data/useTasks';
import { sortForDay } from '../data/taskStore';
import { daysIn, parseDay, shift, toDayKey, toWeekKey, weekStart, WEEKDAY } from '../lib/dates';
import { Chip, Segmented } from '../components/ui';
import TaskRow from '../components/TaskRow';
import { C, HIT, R, T } from '../theme';

const MODES: { value: ViewMode; label: string }[] = [
  { value: 'daily', label: '일간' },
  { value: 'weekly', label: '주간' },
  { value: 'monthly', label: '월간' },
];
const FILTERS: { value: TaskFilter; label: string }[] = [
  { value: 'all', label: '전체' },
  { value: 'todo', label: '미완료' },
  { value: 'done', label: '완료' },
];

export interface CalendarProps {
  mode: ViewMode; setMode: (m: ViewMode) => void;
  day: string; setDay: (d: string) => void;
  filter: TaskFilter; setFilter: (f: TaskFilter) => void;
  today: string;
  onOpen: (t: Task) => void; onBell: (t: Task) => void; onPickDate: () => void; onError: (m: string) => void;
}

export function filterTasks(list: Task[], f: TaskFilter): Task[] {
  return f === 'all' ? list : list.filter((t) => (f === 'done' ? t.done : !t.done));
}

export default function CalendarScreen(p: CalendarProps) {
  const tasks = useTasks();
  const byDay = useMemo(() => {
    const m: Record<string, Task[]> = {};
    for (const t of tasks) (m[t.date] ??= []).push(t);
    return m;
  }, [tasks]);
  const d = parseDay(p.day);

  const headLabel =
    p.mode === 'daily'
      ? `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`
      : p.mode === 'weekly'
        ? (() => {
            const s = weekStart(d);
            const e = new Date(s.getFullYear(), s.getMonth(), s.getDate() + 6);
            return `${s.getFullYear()}년 ${Number(toWeekKey(d).split('-W')[1])}주차 · ${s.getMonth() + 1}/${s.getDate()}~${e.getMonth() + 1}/${e.getDate()}`;
          })()
        : `${d.getFullYear()}년 ${d.getMonth() + 1}월`;

  const unit = p.mode === 'daily' ? '날' : p.mode === 'weekly' ? '주' : '달';
  const go = (n: number) => {
    const next = shift(p.mode, d, n);
    // 월 이동은 1일로 맞춰지므로, 오늘이 든 달이면 오늘로
    const k = toDayKey(next);
    p.setDay(p.mode === 'monthly' && k.slice(0, 7) === p.today.slice(0, 7) ? p.today : k);
  };
  const isCurrent =
    p.mode === 'daily' ? p.day === p.today : p.mode === 'weekly' ? toWeekKey(d) === toWeekKey(parseDay(p.today)) : p.day.slice(0, 7) === p.today.slice(0, 7);

  const days = p.mode === 'daily' ? [p.day] : daysIn(p.mode, d);

  return (
    <View style={{ flex: 1 }}>
      <View style={s.top}>
        <Segmented label="보기 단위" options={MODES} value={p.mode} onChange={(m) => p.setMode(m)} testPrefix="mode" />
        <View style={s.nav}>
          <Pressable onPress={() => go(-1)} style={s.arrow} accessibilityRole="button" accessibilityLabel={`이전 ${unit}`} testID="prev">
            <Ionicons name="chevron-back" size={22} color={C.grey700} />
          </Pressable>
          <Pressable onPress={p.onPickDate} style={s.labelBtn} accessibilityRole="button" accessibilityHint="년, 월, 일 골라 이동" testID="period-label">
            <Text style={s.label}>{headLabel}</Text>
            <Ionicons name="chevron-down" size={16} color={C.grey600} />
          </Pressable>
          <Pressable onPress={() => go(1)} style={s.arrow} accessibilityRole="button" accessibilityLabel={`다음 ${unit}`} testID="next">
            <Ionicons name="chevron-forward" size={22} color={C.grey700} />
          </Pressable>
          <Pressable
            onPress={() => p.setDay(p.today)}
            style={[s.todayBtn, isCurrent && { opacity: 0.3 }]}
            disabled={isCurrent}
            accessibilityRole="button"
            accessibilityState={{ disabled: isCurrent }}
            testID="today"
          >
            <Text style={s.todayText}>오늘</Text>
          </Pressable>
        </View>
        {p.mode === 'daily' && <WeekStrip day={p.day} today={p.today} byDay={byDay} onPick={p.setDay} />}
        <View style={s.filters} accessibilityRole="radiogroup" accessibilityLabel="목록 필터">
          {FILTERS.map((f) => (
            <Chip key={f.value} label={f.label} on={p.filter === f.value} onPress={() => p.setFilter(f.value)} testID={`filter-${f.value}`} />
          ))}
        </View>
      </View>
      <ScrollView contentContainerStyle={s.list} keyboardShouldPersistTaps="handled" testID="cal-scroll">
        {days.map((k) => {
          const list = sortForDay(filterTasks(byDay[k] ?? [], p.filter));
          const all = byDay[k] ?? [];
          if (p.mode === 'daily') {
            return (
              <View key={k} testID={`day-${k}`}>
                {list.length === 0 ? (
                  <Text style={s.empty} testID="day-empty">
                    {all.length === 0 ? '이 날은 업무가 없어요.\n아래에서 할 일을 추가할 수 있어요.' : p.filter === 'done' ? '완료한 업무가 없어요.' : '남은 업무가 없어요.'}
                  </Text>
                ) : (
                  list.map((t) => <TaskRow key={t.id} task={t} onOpen={p.onOpen} onBell={p.onBell} onError={p.onError} />)
                )}
              </View>
            );
          }
          const dd = parseDay(k);
          const doneN = all.filter((t) => t.done).length;
          return (
            <View key={k} style={[s.section, list.length === 0 && s.sectionEmpty]} testID={`day-${k}`}>
              <Pressable
                onPress={() => { p.setDay(k); p.setMode('daily'); }}
                style={s.secHead}
                accessibilityRole="button"
                accessibilityHint="이 날 일간 보기로 이동"
                testID={`dayhead-${k}`}
              >
                <Text style={[s.secDate, k === p.today && { color: C.blueText }, dd.getDay() === 0 && k !== p.today && { color: C.redText }]}>
                  {dd.getMonth() + 1}/{dd.getDate()} ({WEEKDAY[dd.getDay()]}){k === p.today ? ' · 오늘' : ''}
                </Text>
                {all.length > 0 && <Text style={s.secCount}>{doneN}/{all.length} 완료</Text>}
              </Pressable>
              {list.map((t) => <TaskRow key={t.id} task={t} onOpen={p.onOpen} onBell={p.onBell} onError={p.onError} />)}
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

/** 선택한 날이 든 주(월~일). 누르면 그날로. 업무가 있으면 점 */
function WeekStrip({ day, today, byDay, onPick }: { day: string; today: string; byDay: Record<string, Task[]>; onPick: (d: string) => void }) {
  const s0 = weekStart(parseDay(day));
  const keys = Array.from({ length: 7 }, (_, i) => toDayKey(new Date(s0.getFullYear(), s0.getMonth(), s0.getDate() + i)));
  return (
    <View style={s.strip} accessibilityRole="tablist" accessibilityLabel="이번 주 날짜">
      {keys.map((k) => {
        const dd = parseDay(k);
        const on = k === day;
        const list = byDay[k] ?? [];
        const left = list.filter((t) => !t.done).length;
        return (
          <Pressable
            key={k}
            onPress={() => onPick(k)}
            style={s.stripCell}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            aria-selected={on}
            accessibilityLabel={`${dd.getMonth() + 1}월 ${dd.getDate()}일 ${WEEKDAY[dd.getDay()]}요일${k === today ? ', 오늘' : ''}${list.length ? `, 남은 업무 ${left}개` : ''}`}
            testID={`strip-${k}`}
          >
            <Text style={[s.stripWd, dd.getDay() === 0 && { color: C.redText }]}>{WEEKDAY[dd.getDay()]}</Text>
            <View style={[s.stripDay, on && s.stripDayOn, !on && k === today && s.stripToday]}>
              <Text style={[s.stripNum, on && { color: '#fff', fontWeight: '700' }]}>{dd.getDate()}</Text>
            </View>
            <View style={[s.dot, { opacity: list.length ? 1 : 0 }, left === 0 && list.length > 0 && { backgroundColor: C.grey400 }]} />
          </Pressable>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  top: { paddingHorizontal: 16, paddingTop: 4, gap: 8 },
  nav: { flexDirection: 'row', alignItems: 'center' },
  arrow: { width: HIT, height: HIT, alignItems: 'center', justifyContent: 'center' },
  labelBtn: { flex: 1, minHeight: HIT, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 },
  label: { fontSize: 17, fontWeight: '700', color: C.text, textAlign: 'center', flexShrink: 1 },
  todayBtn: { height: 34, paddingHorizontal: 12, borderRadius: R.full, backgroundColor: C.greyBg, justifyContent: 'center', marginLeft: 4 },
  todayText: { fontSize: 14, fontWeight: '700', color: C.grey700 },
  strip: { flexDirection: 'row' },
  stripCell: { flex: 1, alignItems: 'center', paddingVertical: 4, minHeight: HIT },
  stripWd: { fontSize: 12, color: C.grey600, marginBottom: 4 },
  stripDay: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  stripDayOn: { backgroundColor: C.blue },
  stripToday: { borderWidth: 1.5, borderColor: C.blue },
  stripNum: { fontSize: 16, color: C.text },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: C.blue, marginTop: 4 },
  filters: { flexDirection: 'row', gap: 8, paddingBottom: 8 },
  list: { paddingHorizontal: 16, paddingBottom: 24 },
  empty: { ...T.body2, textAlign: 'center', marginTop: 48 },
  section: { borderTopWidth: 1, borderTopColor: C.line, paddingTop: 4, paddingBottom: 6 },
  sectionEmpty: { paddingBottom: 0 },
  secHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: HIT },
  secDate: { fontSize: 15, fontWeight: '700', color: C.grey700 },
  secCount: { fontSize: 13, color: C.grey600 },
});
