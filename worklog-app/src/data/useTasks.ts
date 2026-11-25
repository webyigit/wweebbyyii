import { useEffect, useState, useSyncExternalStore } from 'react';
import { taskStore } from './taskStore';
import type { Task } from '../types';

let snapshot: Task[] = taskStore.getTasks();
const sub = (cb: () => void) =>
  taskStore.subscribe((t) => {
    snapshot = t;
    cb();
  });

/** 화면용 업무 목록(삭제 제외). 변경 시 다시 그림 */
export function useTasks(): Task[] {
  return useSyncExternalStore(sub, () => snapshot, () => snapshot);
}

export function useTasksReady(): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    taskStore.ready().then(() => setReady(true));
  }, []);
  return ready;
}
