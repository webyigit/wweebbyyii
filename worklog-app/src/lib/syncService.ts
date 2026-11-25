import AsyncStorage from '@react-native-async-storage/async-storage';
import type { GitHubConfig, Task } from '../types';
import { taskStore } from '../data/taskStore';
import { getToken } from './secure';
import { GitHubError, sync, validateConfig, type SyncResult } from './github';
import { mergeTasks } from './merge';

// 저장소 위치(비밀 아님)는 AsyncStorage, 토큰은 secure.ts(키체인)에만.
const K_CONFIG = 'worklog.github.v2';
const K_LASTSYNC = 'worklog.lastSync.v2';

export const DEFAULT_CONFIG: GitHubConfig = { owner: '', repo: '', branch: 'main', path: 'worklog/tasks.json' };

export async function loadConfig(): Promise<GitHubConfig> {
  try {
    const raw = await AsyncStorage.getItem(K_CONFIG);
    return raw ? { ...DEFAULT_CONFIG, ...JSON.parse(raw) } : DEFAULT_CONFIG;
  } catch {
    return DEFAULT_CONFIG;
  }
}

export async function saveConfig(c: GitHubConfig): Promise<void> {
  // 토큰이 섞여 들어오지 않게 네 필드만 저장
  const { owner, repo, branch, path } = c;
  await AsyncStorage.setItem(K_CONFIG, JSON.stringify({ owner, repo, branch, path }));
}

export async function loadLastSync(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(K_LASTSYNC);
  } catch {
    return null;
  }
}

/** 설정이 다 차 있고 토큰이 있으면 true (앱 시작·복귀 시 자동 동기화 여부 판단용) */
export async function isSyncConfigured(): Promise<boolean> {
  const c = await loadConfig();
  return !validateConfig(c) && !!(await getToken());
}

/**
 * 합친 결과를 기기에 넣는다. 동기화하는 동안 사용자가 고친 것은
 * 그 시점 기기 값과 한 번 더 합쳐서 지켜 낸다(다음 동기화 때 올라감).
 */
export async function applyMerged(tasks: Task[]): Promise<void> {
  await taskStore.replaceAll(mergeTasks(taskStore.getAllIncludingDeleted(), tasks));
}

let running: Promise<SyncResult> | null = null;

/**
 * 지금 동기화. 설정 화면 버튼, 앱 시작·포그라운드 복귀 때 불러 쓴다.
 * 동시에 여러 번 불려도 한 번만 돈다. 공개 저장소 검사는 설정 화면의 연결 확인에서 한다.
 */
export function syncNow(cfg?: GitHubConfig, token?: string): Promise<SyncResult> {
  if (running) return running;
  running = (async () => {
    await taskStore.ready();
    const c = cfg ?? (await loadConfig());
    const bad = validateConfig(c);
    if (bad) throw new GitHubError(bad);
    const t = token ?? (await getToken());
    if (!t) throw new GitHubError('GitHub 토큰을 넣어 주세요.');
    const r = await sync(c, t, taskStore.getAllIncludingDeleted());
    await applyMerged(r.tasks);
    await AsyncStorage.setItem(K_LASTSYNC, new Date().toISOString());
    return r;
  })().finally(() => {
    running = null;
  });
  return running;
}
