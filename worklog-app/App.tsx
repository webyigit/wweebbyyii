import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StoreProvider, useStore } from './src/lib/store';
import { dateFromKey } from './src/lib/dates';
import RecordScreen from './src/screens/RecordScreen';
import ListScreen from './src/screens/ListScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import type { Period } from './src/types';
import { C, HIT } from './src/theme';

type Tab = 'record' | 'list' | 'settings';
const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: 'record', label: '기록', icon: '✎' },
  { key: 'list', label: '목록', icon: '☰' },
  { key: 'settings', label: '설정', icon: '⚙' },
];

function Main() {
  const { ready, loadError } = useStore();
  const [tab, setTab] = useState<Tab>('record');
  const [period, setPeriod] = useState<Period>('daily');
  const [date, setDate] = useState(() => new Date());

  if (!ready) {
    return <View style={st.center}><ActivityIndicator accessibilityLabel="불러오는 중" /></View>;
  }

  return (
    <SafeAreaView style={st.root} edges={['top', 'left', 'right']}>
      <View style={st.header}>
        <Text style={st.title} accessibilityRole="header">업무 기록</Text>
      </View>
      {loadError && <Text style={st.error}>{loadError}</Text>}
      <View style={{ flex: 1 }}>
        {tab === 'record' && <RecordScreen period={period} date={date} onPeriod={setPeriod} onDate={setDate} />}
        {tab === 'list' && (
          <ListScreen
            onOpen={(e) => {
              setPeriod(e.period);
              setDate(dateFromKey(e.period, e.key));
              setTab('record');
            }}
          />
        )}
        {tab === 'settings' && <SettingsScreen />}
      </View>
      <SafeAreaView edges={['bottom']} style={st.tabbar}>
        <View style={st.tabrow} accessibilityRole="tablist">
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
                testID={`tab-${t.key}`}
              >
                <Text style={[st.tabIcon, on && st.on]} importantForAccessibility="no" accessibilityElementsHidden>{t.icon}</Text>
                <Text style={[st.tabText, on && st.on]}>{t.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </SafeAreaView>
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <StoreProvider>
        <StatusBar style="dark" />
        <Main />
      </StoreProvider>
    </SafeAreaProvider>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg },
  header: { paddingHorizontal: 16, paddingTop: 6, paddingBottom: 2 },
  title: { fontSize: 28, fontWeight: '800', color: C.text },
  error: { color: C.danger, paddingHorizontal: 16 },
  tabbar: { backgroundColor: C.card, borderTopWidth: 1, borderTopColor: C.line },
  tabrow: { flexDirection: 'row' },
  tab: { flex: 1, minHeight: HIT + 8, alignItems: 'center', justifyContent: 'center', paddingVertical: 6 },
  tabIcon: { fontSize: 20, color: C.sub },
  tabText: { fontSize: 12, fontWeight: '700', color: C.sub, marginTop: 2 },
  on: { color: C.primary },
});
