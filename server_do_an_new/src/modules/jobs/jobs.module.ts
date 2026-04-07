/**
 * JobsModule — NestJS module for Background Jobs Manager
 * Registers schemas, services, controller, and all concrete jobs.
 *
 * Jobs:
 *  - SyncLoanStatus: Đồng bộ nhanh trạng thái khoản vay (nhẹ)
 *  - SyncLoanData: Đồng bộ toàn bộ dữ liệu khoản vay (nặng, batch)
 *  - SyncLoanProducts: So sánh sản phẩm vay Fineract ↔ MongoDB
 *  - SyncSavingsProducts: So sánh sản phẩm tiết kiệm Fineract ↔ MongoDB
 *  - Disbursement: Tự động giải ngân khoản vay đủ match + đến ngày (HD-AMC)
 */

import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import { JobConfig, JobConfigSchema } from './schemas/job-config.schema';
import { JobRunHistory, JobRunHistorySchema } from './schemas/job-run-history.schema';
import { JobManagerService } from './job-manager.service';
import { JobsController } from './jobs.controller';
import { SyncLoanStatusJob } from './sync-loan-status.job';
import { SyncLoanDataJob } from './sync-loan-data.job';
import { SyncLoanProductsJob } from './sync-loan-products.job';
import { SyncSavingsProductsJob } from './sync-savings-products.job';
import { SyncFDProductsJob } from './sync-fd-products.job';
import { DisbursementJob } from './disbursement.job';
import { CleanupOrdersJob } from './cleanup-orders.job';
import { AdminModule } from '../admin/admin.module';
import { AdminService } from '../admin/admin.service';
import { FineractModule } from '../fineract/fineract.module';
import { FineractLoanService } from '../fineract/services/fineract-loan.service';
import { LoanApplication, LoanApplicationSchema } from '../loan/schemas/loan-application.schema';
import { InvestModule } from '../invest/invest.module';
import { InvestService } from '../invest/invest.service';
import { InvestmentOrder, InvestmentOrderSchema } from '../invest/schemas/investment-order.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: JobConfig.name, schema: JobConfigSchema },
      { name: JobRunHistory.name, schema: JobRunHistorySchema },
      { name: LoanApplication.name, schema: LoanApplicationSchema },
      { name: InvestmentOrder.name, schema: InvestmentOrderSchema },
    ]),
    forwardRef(() => AdminModule),
    forwardRef(() => InvestModule),
    FineractModule,
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
    {
      provide: 'DISBURSEMENT_JOB',
      useFactory: (
        loanModel: any,
        fineractLoanService: FineractLoanService,
        jobManager: JobManagerService,
      ) => {
        const job = new DisbursementJob(loanModel, fineractLoanService);
        jobManager.register(job);
        return job;
      },
      inject: [getModelToken(LoanApplication.name), FineractLoanService, JobManagerService],
    },
    {
      provide: 'CLEANUP_ORDERS_JOB',
      useFactory: (
        investService: InvestService,
        orderModel: any,
        jobManager: JobManagerService,
      ) => {
        const job = new CleanupOrdersJob(investService, orderModel);
        jobManager.register(job);
        return job;
      },
      inject: [InvestService, getModelToken(InvestmentOrder.name), JobManagerService],
    },
  ],
  exports: [JobManagerService],
})
export class JobsModule {}
