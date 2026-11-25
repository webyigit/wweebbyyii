/**
 * 업무 기록 앱 데이터 모델 (v2, 2026-11-25 확정)
 * 다른 모듈(GitHub 동기화, 알림·위젯)은 이 파일과 src/data/taskStore.ts 의 공개 함수만 씁니다.
 * 날짜 문자열은 모두 '기기 로컬 날짜' 기준입니다.
 */

/** 'YYYY-MM-DD' (로컬 날짜) */
export type DayKey = string;

export interface Task {
  /** 기기에서 만든 고유 id (기기 간 충돌 없게 시각+난수) */
  id: string;
  /** 업무 내용. 화면에는 말줄임 없이 전부 보여 줌 */
  title: string;
  /** 업무가 잡힌 날 */
  date: DayKey;
  done: boolean;
  /** 완료한 시각 ISO. 완료된 업무는 그날 목록 맨 아래로(완료 시각 순) */
  doneAt?: string;
  /** 같은 날 안에서의 순서(작을수록 위). 미완료 업무끼리 정렬에 씀 */
  order: number;
  /** 알림 시각 ISO. 없으면 알림 없음. 알림 모듈이 이 값을 보고 기기 알림을 예약 */
  remindAt?: string;
  /** 미루기 이력: 처음 잡혔던 날. 미룰 때마다 date 만 바뀌고 이 값은 처음 것을 유지 */
  originalDate?: DayKey;
  /** 미룬 횟수 */
  postponedCount?: number;
  createdAt: string;
  /** 마지막 수정 ISO. 동기화 시 늦은 쪽이 이김 */
  updatedAt: string;
  /** 삭제 표시 ISO. 동기화로 다른 기기에 삭제를 전하기 위해 바로 지우지 않음 */
  deletedAt?: string;
}

/** 새 업무를 만들 때 넣는 값 */
export interface NewTask {
  title: string;
  date: DayKey;
  remindAt?: string;
}

/** 수정할 수 있는 값 */
export type TaskPatch = Partial<Pick<Task, 'title' | 'date' | 'remindAt' | 'done'>> & { remindAt?: string | undefined };

export type ViewMode = 'daily' | 'weekly' | 'monthly';
export type TaskFilter = 'all' | 'todo' | 'done';

/** GitHub 에 올리는 파일 모양 (동기화 모듈이 사용) */
export interface SyncFileV2 {
  app: 'worklog';
  version: 2;
  exportedAt: string;
  tasks: Task[];
}

export interface GitHubConfig {
  owner: string;
  repo: string;
  branch: string;
  path: string;
}

/**
 * 저장 계층 인터페이스. 기본 구현은 AsyncStorage(기기 안) — src/data/taskStore.ts
 * 동기화 모듈은 getAllIncludingDeleted() 로 받아 합친 뒤 replaceAll() 로 돌려 넣습니다.
 * 알림·위젯 모듈은 subscribe() 로 변경을 듣습니다.
 */
export interface TaskRepository {
  /** 화면용: 삭제 표시 뺀 전체 */
  getTasks(): Task[];
  /** 동기화용: 삭제 표시 포함 전체 */
  getAllIncludingDeleted(): Task[];
  /** 통째로 바꾸기 (updatedAt 은 건드리지 않음). 동기화에는 applyRemote 를 쓰세요 */
  replaceAll(tasks: Task[]): Promise<void>;
  /** 원격 목록을 '호출 시점의 최신' 기기 데이터와 합쳐 넣음(id 별 updatedAt 늦은 쪽). 동기화는 이걸로 */
  applyRemote(remote: Task[]): Promise<void>;
  /** 저장 데이터를 읽지 못해 쓰기를 막은 상태인지 */
  loadFailed(): boolean;
  add(input: NewTask): Promise<Task>;
  update(id: string, patch: TaskPatch): Promise<void>;
  toggleDone(id: string): Promise<void>;
  /** 다른 날로 미루기(예약 포함: 미래 날짜로 옮기기) */
  postpone(id: string, to: DayKey): Promise<void>;
  remove(id: string): Promise<void>;
  /** 삭제 직후 되돌리기 */
  restore(id: string): Promise<void>;
  /** 변경될 때마다 호출. 해제 함수를 돌려줌 */
  subscribe(listener: (tasks: Task[]) => void): () => void;
  ready(): Promise<void>;
}

// ---- v1(첫 판) 타입: 기존 동기화 코드(src/lib/github.ts·merge.ts)가 v2 로 옮겨지면 지움 ----
/** @deprecated v1 */
export type Period = ViewMode;
/** @deprecated v1 */
export interface Entry {
  id: string; period: Period; key: string; done: string; todo: string; memo: string; updatedAt: string; deletedAt?: string;
}
/** @deprecated v1 */
export interface SyncFile { app: 'worklog'; version: 1; exportedAt: string; entries: Entry[] }
export const PERIOD_LABEL: Record<ViewMode, string> = { daily: '일간', weekly: '주간', monthly: '월간' };
