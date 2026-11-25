import React, { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { Task } from '../types';
import { useTasks } from '../data/useTasks';
import { sortForDay, taskStore } from '../data/taskStore';
import { relDay } from '../lib/dates';
import TaskRow from '../components/TaskRow';
import { Button } from '../components/ui';
import { C, HIT, T } from '../theme';

/** 홈: 아직 끝내지 못한 일만. 지난 날 → 오늘 → 예약(다가오는 날) */
export default function HomeScreen({
  today, onOpen, onBell, onGoDay, onError, onToast,
}: {
  today: string; onOpen: (t: Task) => void; onBell: (t: Task) => void; onGoDay: (d: string) => void;
  onError: (m: string) => void; onToast: (m: string) => void;
}) {
  const tasks = useTasks();
  const { overdue, todays, upcoming } = useMemo(() => {
    const todo = tasks.filter((t) => !t.done);
    const byDate = (a: Task, b: Task) => a.date.localeCompare(b.date) || a.order - b.order;
    return {
      overdue: todo.filter((t) => t.date < today).sort(byDate),
      todays: sortForDay(todo.filter((t) => t.date === today)),
      upcoming: todo.filter((t) => t.date > today).sort(byDate),
    };
  }, [tasks, today]);
  const doneToday = tasks.filter((t) => t.date === today && t.done).length;

  const moveAllToToday = async () => {
    try {
      for (const t of overdue) await taskStore.postpone(t.id, today);
      onToast(`${overdue.length}개를 오늘로 옮겼어요`);
    } catch { onError('옮기지 못했어요. 다시 눌러 주세요.'); }
  };

  const row = (t: Task, showDate: boolean) => <TaskRow key={t.id} task={t} onOpen={onOpen} onBell={onBell} onError={onError} showDate={showDate} />;

  return (
    <ScrollView contentContainerStyle={s.wrap} keyboardShouldPersistTaps="handled" testID="home">
      <Text style={s.summary} testID="home-summary">
        {todays.length === 0 && overdue.length === 0
          ? doneToday ? `오늘 할 일을 모두 끝냈어요. ${doneToday}개 완료` : '오늘 남은 일이 없어요'
          : `오늘 남은 일 ${todays.length}개${overdue.length ? ` · 밀린 일 ${overdue.length}개` : ''}`}
      </Text>

      {overdue.length > 0 && (
        <View style={s.block} testID="home-overdue">
          <View style={s.head}>
            <Text style={[s.h, { color: C.redText }]}>밀린 일</Text>
            <Button title="모두 오늘로" kind="weak" size="m" onPress={moveAllToToday} testID="move-all" />
          </View>
          {overdue.map((t) => row(t, true))}
        </View>
      )}

      <View style={s.block} testID="home-today">
        <Pressable onPress={() => onGoDay(today)} style={s.head} accessibilityRole="button" accessibilityHint="일간 보기로 이동">
          <Text style={s.h}>오늘</Text>
          <Text style={s.more}>일간 보기</Text>
        </Pressable>
        {todays.length ? todays.map((t) => row(t, false)) : <Text style={s.empty}>아래 칸에 오늘 할 일을 적어 보세요.</Text>}
      </View>

      {upcoming.length > 0 && (
        <View style={s.block} testID="home-upcoming">
          <View style={s.head}><Text style={s.h}>예약된 일</Text></View>
          {upcoming.map((t, i) => (
            <View key={t.id}>
              {(i === 0 || upcoming[i - 1].date !== t.date) && (
                <Pressable onPress={() => onGoDay(t.date)} accessibilityRole="button" style={s.sub}>
                  <Text style={s.subText}>{relDay(t.date, today)}</Text>
                </Pressable>
              )}
              {row(t, false)}
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  wrap: { paddingHorizontal: 16, paddingBottom: 24 },
  summary: { ...T.body2, marginTop: 4, marginBottom: 8 },
  block: { marginTop: 12 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: HIT },
  h: { fontSize: 18, fontWeight: '700', color: C.text },
  more: { fontSize: 14, fontWeight: '600', color: C.blueText },
  empty: { ...T.body2, paddingVertical: 12 },
  sub: { minHeight: HIT, justifyContent: 'center' },
  subText: { fontSize: 14, fontWeight: '700', color: C.grey700 },
});
