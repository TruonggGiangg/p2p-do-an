import { Injectable } from '@nestjs/common';
import { AdminService } from '../admin/admin.service';
import { DelinquencyCollectionStage } from './entities/delinquency-policy.schema';

/**
 * Service quản lý nợ xấu (Delinquency).
 * Đóng vai trò như một Facade wrapper để gọi các chức năng từ AdminService,
 * cung cấp các API logic liên quan đến hợp đồng trễ hạn và chính sách thu hồi nợ.
 */
@Injectable()
export class DelinquencyService {
  constructor(private readonly adminService: AdminService) {}

  async getOverdueLoans(filters?: {
    classification?: string;
    minOverdueAmount?: number;
    maxOverdueAmount?: number;
    delinquentDaysMin?: number;
    delinquentDaysMax?: number;
  }) {
    return this.adminService.getOverdueLoans(filters);
  }

  async getDelinquencyRanges() {
    return this.adminService.getDelinquencyRangesForFilter();
  }

  async getLoanDelinquencyList(params?: {
    page?: number;
    limit?: number;
    syncBeforeRead?: boolean;
    status?: 'normal' | 'overdue' | 'defaulted' | 'resolved';
    collectionStage?: 'none' | 'reminder' | 'warning' | 'collection' | 'legal';
    debtGroup?: number;
    borrowerId?: string;
    minOverdueAmount?: number;
    maxOverdueAmount?: number;
    delinquentDaysMin?: number;
    delinquentDaysMax?: number;
  }) {
    return this.adminService.getLoanDelinquencyList(params);
  }

  async syncLoanDelinquencyBatch(limit = 200) {
    return this.adminService.syncLoanDelinquencyBatch(limit);
  }

  async syncOneLoanDelinquency(fineractLoanId: number) {
    return this.adminService.syncOneLoanDelinquency(fineractLoanId);
  }

  async getDelinquencyPolicyDebtGroups() {
    return this.adminService.getDelinquencyPolicyDebtGroups();
  }

  async getDelinquencyPolicies(filters?: {
    is_active?: boolean;
    debt_group?: number;
    loan_product_id?: number;
    collection_stage?: DelinquencyCollectionStage;
  }) {
    return this.adminService.getDelinquencyPolicies(filters);
  }

  async createDelinquencyPolicy(dto: any) {
    return this.adminService.createDelinquencyPolicy(dto);
  }

  async updateDelinquencyPolicy(id: string, dto: any) {
    return this.adminService.updateDelinquencyPolicy(id, dto);
  }

  async removeDelinquencyPolicy(id: string) {
    return this.adminService.removeDelinquencyPolicy(id);
  }
}
