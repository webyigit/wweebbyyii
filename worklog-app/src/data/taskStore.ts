import AsyncStorage from '@react-native-async-storage/async-storage';
import type { DayKey, NewTask, Task, TaskPatch, TaskRepository } from '../types';

const K_TASKS = 'worklog.tasks.v2';

let all: Task[] = [];
let visible: Task[] = [];
const listeners = new Set<(t: Task[]) => void>();
let loaded: Promise<void> | null = null;
let writeChain: Promise<void> = Promise.resolve();

function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function emit() {
  visible = all.filter((t) => !t.deletedAt);
  for (const l of listeners) l(visible);
}

function commit(next: Task[]): Promise<void> {
  all = next;
  emit();
  // 쓰기는 순서대로(겹쳐 쓰다 앞선 값이 뒤에 저장되는 일 방지)
  const snapshot = JSON.stringify(next);
  writeChain = writeChain.then(() => AsyncStorage.setItem(K_TASKS, snapshot)).catch(() => {});
  return writeChain;
}

const now = () => new Date().toISOString();

function patchOne(id: string, fn: (t: Task) => Task): Promise<void> {
  return commit(all.map((t) => (t.id === id ? fn(t) : t)));
}

function maxOrder(date: DayKey): number {
  return all.filter((t) => t.date === date && !t.deletedAt).reduce((m, t) => Math.max(m, t.order), 0);
}

export const taskStore: TaskRepository = {
  ready() {
    if (!loaded) {
      loaded = (async () => {
        try {
          const raw = await AsyncStorage.getItem(K_TASKS);
          const parsed = raw ? JSON.parse(raw) : [];
          all = Array.isArray(parsed) ? parsed : [];
        } catch {
          all = [];
        }
        emit();
      })();
    }
    return loaded;
  },
  getTasks: () => visible,
  getAllIncludingDeleted: () => all,
  replaceAll: (tasks) => commit(tasks),
  async add(input: NewTask) {
    const t: Task = {
      id: newId(),
      title: input.title.trim(),
      date: input.date,
      done: false,
      order: maxOrder(input.date) + 1,
      ...(input.remindAt ? { remindAt: input.remindAt } : {}),
      createdAt: now(),
      updatedAt: now(),
    };
    await commit([...all, t]);
    return t;
  },
  update(id: string, patch: TaskPatch) {
    return patchOne(id, (t) => {
      const next: Task = { ...t, ...patch, updatedAt: now() };
      if ('title' in patch && patch.title !== undefined) next.title = patch.title.trim();
      if ('remindAt' in patch && !patch.remindAt) delete next.remindAt;
      if ('done' in patch) {
        if (patch.done) next.doneAt = t.doneAt ?? now();
        else delete next.doneAt;
      }
      if (patch.date && patch.date !== t.date) next.order = maxOrder(patch.date) + 1;
      return next;
    });
  },
  toggleDone(id: string) {
    return patchOne(id, (t) => {
      const done = !t.done;
      const next: Task = { ...t, done, updatedAt: now() };
      if (done) next.doneAt = now();
      else {
        delete next.doneAt;
        next.order = maxOrder(t.date) + 1; // 다시 미완료로 돌리면 미완료 목록 맨 아래
      }
      return next;
    });
  },
  postpone(id: string, to: DayKey) {
    return patchOne(id, (t) => {
      if (t.date === to) return t;
      return {
        ...t,
        date: to,
        originalDate: t.originalDate ?? t.date,
        postponedCount: (t.postponedCount ?? 0) + 1,
        order: maxOrder(to) + 1,
        updatedAt: now(),
      };
    });
  },
  remove(id: string) {
    const ts = now();
    return patchOne(id, (t) => ({ ...t, deletedAt: ts, updatedAt: ts }));
  },
  restore(id: string) {
    return patchOne(id, (t) => {
      const { deletedAt: _d, ...rest } = t;
      return { ...rest, updatedAt: now() };
    });
  },
  subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

/** 화면 정렬 규칙: 미완료(order 순) 위, 완료(완료 시각 순) 맨 아래 */
export function sortForDay(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    if (!a.done) return a.order - b.order || a.createdAt.localeCompare(b.createdAt);
    return (a.doneAt ?? '').localeCompare(b.doneAt ?? '');
  });
}
