/**
 * JobsModule — NestJS module for Background Jobs Manager
 * Registers schemas, services, controller, and all concrete jobs.
 *
 * Jobs:
 *  - SyncLoanStatus: Đồng bộ nhanh trạng thái khoản vay (nhẹ)
 *  - SyncLoanData: Đồng bộ toàn bộ dữ liệu khoản vay (nặng, batch)
 *  - SyncLoanProducts: So sánh sản phẩm vay Fineract ↔ MongoDB
 *  - SyncSavingsProducts: So sánh sản phẩm tiết kiệm Fineract ↔ MongoDB
 */

import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { JobConfig, JobConfigSchema } from './schemas/job-config.schema';
import { JobRunHistory, JobRunHistorySchema } from './schemas/job-run-history.schema';
import { JobManagerService } from './job-manager.service';
import { JobsController } from './jobs.controller';
import { SyncLoanStatusJob } from './sync-loan-status.job';
import { SyncLoanDataJob } from './sync-loan-data.job';
import { SyncLoanProductsJob } from './sync-loan-products.job';
import { SyncSavingsProductsJob } from './sync-savings-products.job';
import { SyncFDProductsJob } from './sync-fd-products.job';
import { AdminModule } from '../admin/admin.module';
import { AdminService } from '../admin/admin.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: JobConfig.name, schema: JobConfigSchema },
      { name: JobRunHistory.name, schema: JobRunHistorySchema },
    ]),
    forwardRef(() => AdminModule),
  ],
  controllers: [JobsController],
  providers: [
    JobManagerService,
    {
      provide: 'SYNC_LOAN_STATUS_JOB',
      useFactory: (adminService: AdminService, jobManager: JobManagerService) => {
        const job = new SyncLoanStatusJob(adminService);
        jobManager.register(job);
        return job;
      },
      inject: [AdminService, JobManagerService],
    },
    {
      provide: 'SYNC_LOAN_DATA_JOB',
      useFactory: (adminService: AdminService, jobManager: JobManagerService) => {
        const job = new SyncLoanDataJob(adminService);
        jobManager.register(job);
        return job;
      },
      inject: [AdminService, JobManagerService],
    },
    {
      provide: 'SYNC_LOAN_PRODUCTS_JOB',
      useFactory: (adminService: AdminService, jobManager: JobManagerService) => {
        const job = new SyncLoanProductsJob(adminService);
        jobManager.register(job);
        return job;
      },
      inject: [AdminService, JobManagerService],
    },
    {
      provide: 'SYNC_SAVINGS_PRODUCTS_JOB',
      useFactory: (adminService: AdminService, jobManager: JobManagerService) => {
        const job = new SyncSavingsProductsJob(adminService);
        jobManager.register(job);
        return job;
      },
      inject: [AdminService, JobManagerService],
    },
    {
      provide: 'SYNC_FD_PRODUCTS_JOB',
      useFactory: (adminService: AdminService, jobManager: JobManagerService) => {
        const job = new SyncFDProductsJob(adminService);
        jobManager.register(job);
        return job;
      },
      inject: [AdminService, JobManagerService],
    },
  ],
  exports: [JobManagerService],
})
export class JobsModule {}
