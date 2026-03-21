/**
 * Background Jobs API service for admin web
 */
import { api } from './client';

export interface RunHistoryEntry {
  _id?: string;
  jobName: string;
  runAt: string;
  params: Record<string, any>;
  status: 'success' | 'error' | 'running';
  durationMs: number | null;
  result: any;
  error: string | null;
}

export interface ParamSchema {
  key: string;
  label: string;
  description: string;
  type: 'number' | 'interval' | 'time' | 'text';
  unit?: string;
}

export interface JobProgress {
  current: number;
  total: number;
  percent: number;
  message?: string;
}

export interface JobStatus {
  name: string;
  description: string;
  enabled: boolean;
  isStarted: boolean;
  isRunning: boolean;
  intervalMs: number | null;
  interval: string | null;
  scheduleTime: string | null;
  params: Record<string, any>;
  paramsSchema: ParamSchema[];
  lastRunAt: string | null;
  lastRunDuration: string | null;
  lastRunError: string | null;
  lastSuccessAt: string | null;
  runCount: number;
  errorCount: number;
  progress: JobProgress | null;
  recentHistory?: RunHistoryEntry[];
}

export interface JobManagerStatus {
  startedAt: string | null;
  totalJobs: number;
  runningJobs: number;
  enabledJobs: number;
  jobs: JobStatus[];
}

export const backgroundJobsApi = {
  getJobs: () =>
    api.get<{ data: JobManagerStatus }>('/api/admin/background-jobs').then(r => r.data.data),

  getJob: (name: string) =>
    api.get<{ data: JobStatus }>(`/api/admin/background-jobs/${name}`).then(r => r.data.data),

  startJob: (name: string) =>
    api.post<{ data: JobStatus }>(`/api/admin/background-jobs/${name}/start`).then(r => r.data.data),

  stopJob: (name: string) =>
    api.post<{ data: JobStatus }>(`/api/admin/background-jobs/${name}/stop`).then(r => r.data.data),

  runJobNow: (name: string) =>
    api.post<{ data: JobStatus }>(`/api/admin/background-jobs/${name}/run`).then(r => r.data.data),

  updateParams: (name: string, params: Record<string, any>) =>
    api.put<{ data: JobStatus }>(`/api/admin/background-jobs/${name}/params`, params).then(r => r.data.data),
};
