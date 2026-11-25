import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, BackHandler, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { taskStore } from './src/data/taskStore';
import { useTasks, useTasksReady } from './src/data/useTasks';
import { useToday } from './src/lib/useToday';
import type { Task, TaskFilter, ViewMode } from './src/types';
import HomeScreen from './src/screens/HomeScreen';
import CalendarScreen from './src/screens/CalendarScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import AddTaskBar from './src/components/AddTaskBar';
import TaskSheet from './src/components/TaskSheet';
import ReminderSheet from './src/components/ReminderSlot';
import DatePickerSheet from './src/components/DatePickerSheet';
import { Toast } from './src/components/ui';
import { C, HIT, MAX_W, T } from './src/theme';

type Tab = 'home' | 'calendar' | 'settings';
const TABS: { key: Tab; label: string; icon: keyof typeof Ionicons.glyphMap; iconOn: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'home', label: '홈', icon: 'home-outline', iconOn: 'home' },
  { key: 'calendar', label: '기록', icon: 'calendar-outline', iconOn: 'calendar' },
  { key: 'settings', label: '설정', icon: 'settings-outline', iconOn: 'settings' },
];

type ToastState = { text: string; undo?: () => void } | null;

function Main() {
  const ready = useTasksReady();
  const tasks = useTasks();
  const today = useToday();
  const [tab, setTab] = useState<Tab>('home');
  const [mode, setMode] = useState<ViewMode>('daily');
  const [day, setDay] = useState(today);
  const [filter, setFilter] = useState<TaskFilter>('all');
  const [openId, setOpenId] = useState<string | null>(null);
  const [bellId, setBellId] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);

  // 시트에는 항상 최신 업무를 넘김(체크·동기화로 바뀐 값 반영)
  const openTask = tasks.find((t) => t.id === openId) ?? null;
  const bellTask = tasks.find((t) => t.id === bellId) ?? null;

  const onError = useCallback((m: string) => setToast({ text: m }), []);
  const onDeleted = useCallback((t: Task) => setToast({ text: '삭제했어요', undo: () => taskStore.restore(t.id) }), []);
  const goDay = useCallback((d: string) => { setDay(d); setMode('daily'); setTab('calendar'); }, []);

  // 안드로이드 뒤로가기: 홈이 아니면 홈으로
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (tab !== 'home') { setTab('home'); return true; }
      return false;
    });
    return () => sub.remove();
  }, [tab]);

  if (!ready) return <View style={st.center}><ActivityIndicator accessibilityLabel="불러오는 중" /></View>;

  const countByDay: Record<string, number> = {};
  for (const t of tasks) countByDay[t.date] = (countByDay[t.date] ?? 0) + 1;
  const addDay = tab === 'home' ? today : day;

  return (
    <SafeAreaView style={st.root} edges={['top', 'left', 'right']}>
      <View style={st.col}>
        <View style={st.header}>
          <Text style={T.h1} accessibilityRole="header">{tab === 'home' ? '할 일' : tab === 'calendar' ? '업무 기록' : '설정'}</Text>
        </View>
        {taskStore.loadFailed() && (
          <Text style={st.warn} testID="load-failed">저장된 업무를 읽지 못했어요. 원본은 따로 보관했고, 지금은 새로 적은 내용이 저장되지 않아요. 앱을 다시 열어 주세요.</Text>
        )}
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={{ flex: 1 }}>
            {tab === 'home' && (
              <HomeScreen today={today} onOpen={(t) => setOpenId(t.id)} onBell={(t) => setBellId(t.id)} onGoDay={goDay} onError={onError} onToast={(m) => setToast({ text: m })} />
            )}
            {tab === 'calendar' && (
              <CalendarScreen
                mode={mode} setMode={setMode} day={day} setDay={setDay} filter={filter} setFilter={setFilter} today={today}
                onOpen={(t) => setOpenId(t.id)} onBell={(t) => setBellId(t.id)} onPickDate={() => setPicking(true)} onError={onError}
              />
            )}
            {tab === 'settings' && <SettingsScreen />}
          </View>
          {tab !== 'settings' && (
            <AddTaskBar
              key={addDay}
              day={addDay}
              onError={onError}
              onAdded={(d) => { if (d !== addDay) setToast({ text: `${d.slice(5).replace('-', '/')}에 예약했어요` }); }}
            />
          )}
        </KeyboardAvoidingView>
      </View>
      <SafeAreaView edges={['bottom']} style={st.tabbar}>
        <View style={[st.tabrow, st.col]} accessibilityRole="tablist">
          {TABS.map((t) => {
            const on = t.key === tab;
            return (
              <Pressable
                key={t.key}
                onPress={() => setTab(t.key)}
                style={st.tab}
                accessibilityRole="tab"
                accessibilityLabel={t.label}
                accessibilityState={{ selected: on }}
                aria-selected={on}
                testID={`tab-${t.key}`}
              >
                <Ionicons name={on ? t.iconOn : t.icon} size={24} color={on ? C.text : C.grey500} />
                <Text style={[st.tabText, on && st.tabOn]}>{t.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </SafeAreaView>

      <TaskSheet task={openTask} onClose={() => setOpenId(null)} onDeleted={onDeleted} onError={onError} />
      <ReminderSheet task={bellTask} visible={!!bellTask} onClose={() => setBellId(null)} />
      <DatePickerSheet visible={picking} value={day} onClose={() => setPicking(false)} onPick={setDay} countByDay={countByDay} title="날짜로 이동" />
      <Toast
        text={toast?.text ?? null}
        actionLabel={toast?.undo ? '되돌리기' : undefined}
        onAction={toast?.undo}
        onHide={() => setToast(null)}
      />
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <Main />
    </SafeAreaProvider>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.grey50 },
  col: { flex: 1, width: '100%', maxWidth: MAX_W, alignSelf: 'center', backgroundColor: C.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg },
  header: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 6 },
  warn: { color: C.redText, paddingHorizontal: 16, paddingBottom: 8, fontSize: 14 },
  tabbar: { backgroundColor: C.bg, borderTopWidth: 1, borderTopColor: C.line },
  tabrow: { flexDirection: 'row', flex: 0 },
  tab: { flex: 1, minHeight: HIT + 10, alignItems: 'center', justifyContent: 'center', paddingVertical: 6 },
  tabText: { fontSize: 12, fontWeight: '500', color: C.grey600, marginTop: 2 },
  tabOn: { color: C.text, fontWeight: '700' },
});
