/**
 * JobManagerService — Singleton registry for all background jobs
 * Pattern: HD-AMC JobManager.js, adapted for NestJS DI
 */

import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BaseJob, type JobStatusInfo } from './base-job';
import { JobConfig } from './schemas/job-config.schema';
import { JobRunHistory } from './schemas/job-run-history.schema';

export interface JobManagerStatusInfo {
  startedAt: Date | null;
  totalJobs: number;
  runningJobs: number;
  enabledJobs: number;
  jobs: (JobStatusInfo & { recentHistory?: any[] })[];
}

@Injectable()
export class JobManagerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(JobManagerService.name);
  private readonly _jobs = new Map<string, BaseJob>();
  private _startedAt: Date | null = null;

  constructor(
    @InjectModel(JobConfig.name) private readonly jobConfigModel: Model<JobConfig>,
    @InjectModel(JobRunHistory.name) private readonly jobRunHistoryModel: Model<JobRunHistory>,
  ) {}

  async onModuleInit() {
    // Auto-start all registered jobs when module initializes
    await this.startAll();
  }

  onModuleDestroy() {
    this.stopAll();
  }

  // ═══════════════════════════════════════════════════════
  //  REGISTRY
  // ═══════════════════════════════════════════════════════

  register(job: BaseJob): void {
    if (this._jobs.has(job.name)) {
      this.logger.warn(`"${job.name}" already registered, overwriting`);
    }
    job.setModels(this.jobConfigModel, this.jobRunHistoryModel);
    this._jobs.set(job.name, job);
    this.logger.log(`Registered: ${job.name}`);
  }

  // ═══════════════════════════════════════════════════════
  //  LIFECYCLE
  // ═══════════════════════════════════════════════════════

  async startAll(): Promise<void> {
    this._startedAt = new Date();
    this.logger.log('');
    this.logger.log('╔══════════════════════════════════════════╗');
    this.logger.log('║     Background Jobs Manager Starting     ║');
    this.logger.log('╚══════════════════════════════════════════╝');
    this.logger.log('');

    for (const job of this._jobs.values()) {
      try {
        await job.start();
      } catch (error: any) {
        this.logger.error(`Failed to start ${job.name}: ${error.message}`);
      }
    }

    this.logger.log(`✓ ${this._jobs.size} jobs registered`);
  }

  stopAll(): void {
    for (const job of this._jobs.values()) {
      try {
        job.stop();
      } catch (e: any) {
        this.logger.error(`${job.name}: ${e.message}`);
      }
    }
    this.logger.log('All jobs stopped');
  }

  async startJob(name: string): Promise<JobStatusInfo> {
    const job = this._getJobOrThrow(name);
    job.enabled = true;
    await job.saveConfig();
    await job.start();
    return job.getStatus();
  }

  async stopJob(name: string): Promise<JobStatusInfo> {
    const job = this._getJobOrThrow(name);
    job.stop();
    job.enabled = false;
    await job.saveConfig();
    return job.getStatus();
  }

  async runJobNow(name: string): Promise<JobStatusInfo> {
    const job = this._getJobOrThrow(name);
    await job.runNow();
    return job.getStatus();
  }

  async updateParams(name: string, params: Record<string, any>): Promise<JobStatusInfo> {
    const job = this._getJobOrThrow(name);
    await job.updateParams(params);
    return job.getStatus();
  }

  // ═══════════════════════════════════════════════════════
  //  STATUS
  // ═══════════════════════════════════════════════════════

  async getStatus(): Promise<JobManagerStatusInfo> {
    const jobs: (JobStatusInfo & { recentHistory?: any[] })[] = [];
    for (const job of this._jobs.values()) {
      const status = job.getStatus();
      const recentHistory = await job.getHistory(10);
      jobs.push({ ...status, recentHistory });
    }
    return {
      startedAt: this._startedAt,
      totalJobs: this._jobs.size,
      runningJobs: jobs.filter(j => j.isRunning).length,
      enabledJobs: jobs.filter(j => j.enabled).length,
      jobs,
    };
  }

  async getJobStatus(name: string): Promise<JobStatusInfo & { recentHistory: any[] }> {
    const job = this._getJobOrThrow(name);
    const status = job.getStatus();
    const recentHistory = await job.getHistory(20);
    return { ...status, recentHistory };
  }

  // ═══════════════════════════════════════════════════════
  //  INTERNAL
  // ═══════════════════════════════════════════════════════

  private _getJobOrThrow(name: string): BaseJob {
    const job = this._jobs.get(name);
    if (!job) throw new Error(`Job "${name}" not found`);
    return job;
  }
}
