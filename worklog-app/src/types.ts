export type Period = 'daily' | 'weekly' | 'monthly';

/** 기간 하나(하루·한 주·한 달)에 기록 하나. id = `${period}:${key}` */
export interface Entry {
  id: string;
  period: Period;
  /** daily: 2026-11-25, weekly: 2026-W48, monthly: 2026-11 */
  key: string;
  done: string;
  todo: string;
  memo: string;
  updatedAt: string;
  /** 삭제 표시(동기화로 다른 기기에 삭제를 전달하기 위함) */
  deletedAt?: string;
}

export interface SyncFile {
  app: 'worklog';
  version: 1;
  exportedAt: string;
  entries: Entry[];
}

export interface GitHubConfig {
  owner: string;
  repo: string;
  branch: string;
  path: string;
}

export const PERIOD_LABEL: Record<Period, string> = {
  daily: '일간',
  weekly: '주간',
  monthly: '월간',
};
