/**
 * BaseJob — Abstract base class for all background jobs
 * Pattern: HD-AMC BaseJob.js, adapted for NestJS + Mongoose
 *
 * Features:
 *  - Config persistence (load/save from MongoDB job_configs)
 *  - Safe execution wrapper (prevents concurrent runs)
 *  - Run history persistence (job_run_histories)
 *  - Runtime param updates + interval/scheduleTime switching
 *  - Status reporting for admin dashboard
 */

import { Logger } from '@nestjs/common';
import { Model } from 'mongoose';
import { JobConfig } from './schemas/job-config.schema';
import { JobRunHistory } from './schemas/job-run-history.schema';

export interface ParamSchema {
  key: string;
  label: string;
  description: string;
  type: 'number' | 'interval' | 'time' | 'text';
  unit?: string;
}

export interface JobOptions {
  name: string;
  description?: string;
  intervalMs?: number;
  scheduleTime?: string | null;
  enabled?: boolean;
  runOnStart?: boolean;
  startDelay?: number;
  params?: Record<string, any>;
  paramsSchema?: ParamSchema[];
}

export interface JobProgress {
  current: number;
  total: number;
  percent: number;
  message?: string;
}

export interface JobStatusInfo {
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
  lastRunAt: Date | null;
  lastRunDuration: string | null;
  lastRunError: string | null;
  lastSuccessAt: Date | null;
  runCount: number;
  errorCount: number;
  progress: JobProgress | null;
  recentHistory?: any[];
}

export abstract class BaseJob {
  protected readonly logger: Logger;

  name: string;
  description: string;
  intervalMs: number | null;
  scheduleTime: string | null;
  enabled: boolean;
  runOnStart: boolean;
  startDelay: number;
  params: Record<string, any>;
  paramsSchema: ParamSchema[];

  // State
  private _isRunning = false;
  private _isStarted = false;
  private _intervalHandle: ReturnType<typeof setInterval> | null = null;

  // In-memory stats
  private _lastRunAt: Date | null = null;
  private _lastRunDuration: number | null = null;
  private _lastRunError: string | null = null;
  private _lastSuccessAt: Date | null = null;
  private _runCount = 0;
  private _errorCount = 0;
  private _progress: JobProgress | null = null;

  // Injected models
  protected jobConfigModel: Model<JobConfig> | null = null;
  protected jobRunHistoryModel: Model<JobRunHistory> | null = null;

  constructor(options: JobOptions) {
    this.name = options.name;
    this.description = options.description || '';
    this.intervalMs = options.intervalMs || null;
    this.scheduleTime = options.scheduleTime || null;
    this.enabled = options.enabled !== false;
    this.runOnStart = options.runOnStart || false;
    this.startDelay = options.startDelay || 0;
    this.params = options.params || {};
    this.paramsSchema = options.paramsSchema || [];
    this.logger = new Logger(this.name);
  }

  /** Must be implemented by concrete jobs */
  abstract execute(): Promise<any>;

  /** Set progress for real-time tracking (call from execute) */
  protected setProgress(current: number, total: number, message?: string): void {
    this._progress = {
      current,
      total,
      percent: total > 0 ? Math.round((current / total) * 100) : 0,
      message,
    };
  }

  /** Inject Mongoose models (called by JobManagerService) */
  setModels(configModel: Model<JobConfig>, historyModel: Model<JobRunHistory>) {
    this.jobConfigModel = configModel;
    this.jobRunHistoryModel = historyModel;
  }

  // ═══════════════════════════════════════════════════════
  //  CONFIG PERSISTENCE
  // ═══════════════════════════════════════════════════════

  async loadConfig(): Promise<void> {
    if (!this.jobConfigModel) return;
    try {
      const saved = await this.jobConfigModel.findOne({ jobName: this.name });
      if (saved) {
        if (saved.intervalMs != null) this.intervalMs = saved.intervalMs;
        if (saved.scheduleTime != null) this.scheduleTime = saved.scheduleTime;
        if (saved.enabled != null) this.enabled = saved.enabled;
        if (saved.params) this.params = { ...this.params, ...saved.params };
        this.logger.log('✓ Config loaded from DB');
      }
    } catch (err: any) {
      this.logger.warn(`Could not load config: ${err.message}`);
    }
  }

  async saveConfig(): Promise<void> {
    if (!this.jobConfigModel) return;
    try {
      await this.jobConfigModel.findOneAndUpdate(
        { jobName: this.name },
        {
          jobName: this.name,
          intervalMs: this.intervalMs,
          scheduleTime: this.scheduleTime,
          enabled: this.enabled,
          params: this.params,
        },
        { upsert: true, new: true },
      );
    } catch (err: any) {
      this.logger.warn(`Could not save config: ${err.message}`);
    }
  }

  // ═══════════════════════════════════════════════════════
  //  LIFECYCLE
  // ═══════════════════════════════════════════════════════

  async start(): Promise<void> {
    if (this._isStarted) return;

    await this.loadConfig();

    if (!this.enabled) {
      this.logger.log('Disabled, skipping start');
      return;
    }

    this._isStarted = true;
    this._setupInterval();

    if (this.runOnStart) {
      if (this.startDelay > 0) {
        setTimeout(() => this._safeExecute(), this.startDelay);
      } else {
        this._safeExecute();
      }
    }
  }

  stop(): void {
    if (!this._isStarted) return;
    if (this._intervalHandle) {
      clearInterval(this._intervalHandle);
      this._intervalHandle = null;
    }
    this._isStarted = false;
    this.logger.log('✗ Stopped');
  }

  async runNow(): Promise<any> {
    return this._safeExecute();
  }

  // ═══════════════════════════════════════════════════════
  //  PARAMS & CONFIG
  // ═══════════════════════════════════════════════════════

  async updateParams(newParams: Record<string, any>): Promise<void> {
    let needRestart = false;

    if ('intervalMs' in newParams) {
      this.intervalMs = Number(newParams.intervalMs);
      delete newParams.intervalMs;
      needRestart = true;
    }
    if ('scheduleTime' in newParams) {
      this.scheduleTime = newParams.scheduleTime || null;
      delete newParams.scheduleTime;
      needRestart = true;
    }

    this.params = { ...this.params, ...newParams };

    if (needRestart) this._restartSchedule();
    await this.saveConfig();
    this.logger.log('Config saved');
  }

  // ═══════════════════════════════════════════════════════
  //  STATUS & HISTORY
  // ═══════════════════════════════════════════════════════

  getStatus(): JobStatusInfo {
    return {
      name: this.name,
      description: this.description,
      enabled: this.enabled,
      isStarted: this._isStarted,
      isRunning: this._isRunning,
      intervalMs: this.intervalMs,
      interval: this.intervalMs ? this._formatMs(this.intervalMs) : null,
      scheduleTime: this.scheduleTime || null,
      params: this.params,
      paramsSchema: this.paramsSchema,
      lastRunAt: this._lastRunAt,
      lastRunDuration: this._lastRunDuration ? `${this._lastRunDuration}ms` : null,
      lastRunError: this._lastRunError,
      lastSuccessAt: this._lastSuccessAt,
      runCount: this._runCount,
      errorCount: this._errorCount,
      progress: this._progress,
    };
  }

  async getHistory(limit = 20): Promise<any[]> {
    if (!this.jobRunHistoryModel) return [];
    try {
      return await this.jobRunHistoryModel
        .find({ jobName: this.name })
        .sort({ runAt: -1 })
        .limit(limit)
        .lean();
    } catch {
      return [];
    }
  }

  // ═══════════════════════════════════════════════════════
  //  INTERNAL
  // ═══════════════════════════════════════════════════════

  private _setupInterval(): void {
    if (!this.intervalMs) return;

    if (this.scheduleTime) {
      this._intervalHandle = setInterval(() => {
        const now = new Date();
        const [h, m] = this.scheduleTime!.split(':').map(Number);
        if (now.getHours() === h && now.getMinutes() === m) {
          this._safeExecute();
        }
      }, 60 * 1000);
      this.logger.log(`✓ Hàng ngày lúc ${this.scheduleTime}`);
    } else {
      this._intervalHandle = setInterval(() => this._safeExecute(), this.intervalMs);
      this.logger.log(`✓ Mỗi ${this._formatMs(this.intervalMs)}`);
    }
  }

  private _restartSchedule(): void {
    if (this._intervalHandle) {
      clearInterval(this._intervalHandle);
      this._intervalHandle = null;
    }
    if (this._isStarted) this._setupInterval();
  }

  private async _safeExecute(): Promise<any> {
    if (this._isRunning) return;

    this._isRunning = true;
    this._lastRunAt = new Date();
    const startTime = Date.now();

    let status: 'running' | 'success' | 'error' = 'running';
    let result: any = null;
    let error: string | null = null;

    try {
      result = await this.execute();
      this._lastSuccessAt = new Date();
      this._lastRunError = null;
      status = 'success';
    } catch (err: any) {
      this._lastRunError = err.message;
      this._errorCount++;
      error = err.message;
      status = 'error';
      this.logger.error(`Error: ${err.message}`);
    } finally {
      this._lastRunDuration = Date.now() - startTime;
      this._runCount++;
      this._isRunning = false;
      this._progress = null;  // Clear progress after run

      // Persist to MongoDB
      if (this.jobRunHistoryModel) {
        try {
          await this.jobRunHistoryModel.create({
            jobName: this.name,
            runAt: this._lastRunAt,
            status,
            durationMs: this._lastRunDuration,
            params: { ...this.params },
            result,
            error,
          });
        } catch (dbErr: any) {
          this.logger.warn(`Could not save run history: ${dbErr.message}`);
        }
      }
    }

    return result;
  }

  private _formatMs(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${ms / 1000} giây`;
    if (ms < 3600000) return `${ms / 60000} phút`;
    return `${ms / 3600000} giờ`;
  }
}
