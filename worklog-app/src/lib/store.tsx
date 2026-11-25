import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Entry, GitHubConfig, Period } from '../types';
import { isEmpty } from './merge';

const K_ENTRIES = 'worklog.entries.v1';
const K_CONFIG = 'worklog.github.v1';
const K_LASTSYNC = 'worklog.lastSync.v1';

export const DEFAULT_CONFIG: GitHubConfig = { owner: '', repo: '', branch: 'main', path: 'worklog/data.json' };

interface Store {
  ready: boolean;
  loadError: string | null;
  /** 삭제 표시 포함 전체 (동기화용) */
  all: Entry[];
  /** 화면에 보일 기록(삭제·빈 기록 제외) */
  entries: Entry[];
  get: (period: Period, key: string) => Entry | undefined;
  save: (period: Period, key: string, fields: Pick<Entry, 'done' | 'todo' | 'memo'>) => Promise<void>;
  remove: (id: string) => Promise<void>;
  replaceAll: (all: Entry[]) => Promise<void>;
  config: GitHubConfig;
  setConfig: (c: GitHubConfig) => Promise<void>;
  lastSync: string | null;
  setLastSync: (iso: string) => Promise<void>;
}

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [all, setAll] = useState<Entry[]>([]);
  const allRef = useRef<Entry[]>([]);
  const [config, setConfigState] = useState<GitHubConfig>(DEFAULT_CONFIG);
  const [lastSync, setLastSyncState] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [e, c, l] = await Promise.all([
          AsyncStorage.getItem(K_ENTRIES),
          AsyncStorage.getItem(K_CONFIG),
          AsyncStorage.getItem(K_LASTSYNC),
        ]);
        if (e) {
          const parsed = JSON.parse(e);
          if (Array.isArray(parsed)) {
            allRef.current = parsed;
            setAll(parsed);
          }
        }
        if (c) setConfigState({ ...DEFAULT_CONFIG, ...JSON.parse(c) });
        if (l) setLastSyncState(l);
      } catch {
        setLoadError('저장된 기록을 읽지 못했습니다. 앱을 다시 열어 보세요.');
      } finally {
        setReady(true);
      }
    })();
  }, []);

  const persist = useCallback(async (next: Entry[]) => {
    allRef.current = next;
    setAll(next);
    await AsyncStorage.setItem(K_ENTRIES, JSON.stringify(next));
  }, []);

  const save = useCallback<Store['save']>(
    async (period, key, fields) => {
      const id = `${period}:${key}`;
      const cur = allRef.current.find((e) => e.id === id);
      const now = new Date().toISOString();
      if (isEmpty(fields)) {
        // 모두 지우면 삭제로 처리(동기화로 다른 기기에도 반영)
        if (!cur || cur.deletedAt) return;
        await persist(allRef.current.map((e) => (e.id === id ? { ...e, ...fields, updatedAt: now, deletedAt: now } : e)));
        return;
      }
      if (cur && !cur.deletedAt && cur.done === fields.done && cur.todo === fields.todo && cur.memo === fields.memo) return;
      const next: Entry = { id, period, key, ...fields, updatedAt: now };
      await persist(cur ? allRef.current.map((e) => (e.id === id ? next : e)) : [...allRef.current, next]);
    },
    [persist],
  );

  const remove = useCallback<Store['remove']>(
    async (id) => {
      const now = new Date().toISOString();
      await persist(
        allRef.current.map((e) => (e.id === id ? { ...e, done: '', todo: '', memo: '', updatedAt: now, deletedAt: now } : e)),
      );
    },
    [persist],
  );

  const setConfig = useCallback(async (c: GitHubConfig) => {
    setConfigState(c);
    await AsyncStorage.setItem(K_CONFIG, JSON.stringify(c));
  }, []);

  const setLastSync = useCallback(async (iso: string) => {
    setLastSyncState(iso);
    await AsyncStorage.setItem(K_LASTSYNC, iso);
  }, []);

  const entries = useMemo(() => all.filter((e) => !e.deletedAt && !isEmpty(e)), [all]);
  const get = useCallback((p: Period, k: string) => entries.find((e) => e.id === `${p}:${k}`), [entries]);

  const value: Store = {
    ready, loadError, all, entries, get, save, remove, replaceAll: persist,
    config, setConfig, lastSync, setLastSync,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('StoreProvider 가 없습니다');
  return s;
}
