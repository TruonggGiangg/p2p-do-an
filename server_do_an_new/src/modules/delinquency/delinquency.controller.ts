import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../admin/guards/admin.guard';
import { PoliciesGuard } from '../casl/policies.guard';
import { CheckPolicies } from '../../common/decorators/check-policies.decorator';
import { Action } from '../casl/actions.enum';
import { DelinquencyService } from './delinquency.service';
import { CreateDelinquencyPolicyDto } from './dto/create-delinquency-policy.dto';
import { UpdateDelinquencyPolicyDto } from './dto/update-delinquency-policy.dto';
import { DelinquencyCollectionStage } from './entities/delinquency-policy.schema';

@ApiTags('delinquency')
@ApiBearerAuth()
@Controller('delinquency')
@UseGuards(JwtAuthGuard)
export class DelinquencyController {
  constructor(private readonly delinquencyService: DelinquencyService) {}

  @Get('overdue-loans')
  @CheckPolicies(ability => ability.can(Action.Read, 'Loan'))
  @ApiOperation({ summary: 'Danh sách khoản vay quá hạn' })
  @ApiResponse({ status: 200 })
  async getOverdueLoans(
    @Query('classification') classification?: string,
    @Query('minOverdueAmount') minOverdueAmount?: string,
    @Query('maxOverdueAmount') maxOverdueAmount?: string,
    @Query('delinquentDaysMin') delinquentDaysMin?: string,
    @Query('delinquentDaysMax') delinquentDaysMax?: string,
  ) {
    const filters: {
      classification?: string;
      minOverdueAmount?: number;
      maxOverdueAmount?: number;
      delinquentDaysMin?: number;
      delinquentDaysMax?: number;
    } = {};
    if (classification) filters.classification = classification;
    const n1 = minOverdueAmount != null ? parseFloat(minOverdueAmount) : NaN;
    if (!isNaN(n1) && n1 >= 0) filters.minOverdueAmount = n1;
    const n2 = maxOverdueAmount != null ? parseFloat(maxOverdueAmount) : NaN;
    if (!isNaN(n2) && n2 >= 0) filters.maxOverdueAmount = n2;
    const d1 = delinquentDaysMin != null ? parseInt(delinquentDaysMin, 10) : NaN;
    if (!isNaN(d1) && d1 >= 0) filters.delinquentDaysMin = d1;
    const d2 = delinquentDaysMax != null ? parseInt(delinquentDaysMax, 10) : NaN;
    if (!isNaN(d2) && d2 >= 0) filters.delinquentDaysMax = d2;
    const data = await this.delinquencyService.getOverdueLoans(filters);
    return { statusCode: 200, message: 'OK', data };
  }

  @Get('ranges')
  @CheckPolicies(ability => ability.can(Action.Read, 'Loan'))
  @ApiOperation({ summary: 'Danh sách nhóm quá hạn (ranges) từ Fineract' })
  @ApiResponse({ status: 200 })
  async getDelinquencyRanges() {
    const data = await this.delinquencyService.getDelinquencyRanges();
    return { statusCode: 200, message: 'OK', data };
  }

  @Get('loan-delinquency')
  @CheckPolicies(ability => ability.can(Action.Read, 'Loan'))
  @ApiOperation({ summary: 'Danh sách loan_delinquency' })
  @ApiResponse({ status: 200 })
  async getLoanDelinquencyList(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('syncBeforeRead') syncBeforeRead?: string,
    @Query('status') status?: 'normal' | 'overdue' | 'defaulted' | 'resolved',
    @Query('collectionStage') collectionStage?: 'none' | 'reminder' | 'warning' | 'collection' | 'legal',
    @Query('debtGroup') debtGroup?: string,
    @Query('borrowerId') borrowerId?: string,
    @Query('minOverdueAmount') minOverdueAmount?: string,
    @Query('maxOverdueAmount') maxOverdueAmount?: string,
    @Query('delinquentDaysMin') delinquentDaysMin?: string,
    @Query('delinquentDaysMax') delinquentDaysMax?: string,
  ) {
    const payload: any = {
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
      syncBeforeRead: syncBeforeRead !== 'false',
      status,
      collectionStage,
      borrowerId,
    };
    if (debtGroup != null) {
      const parsed = parseInt(debtGroup, 10);
      if (!Number.isNaN(parsed)) payload.debtGroup = parsed;
    }
    if (minOverdueAmount != null) {
      const parsed = parseFloat(minOverdueAmount);
      if (!Number.isNaN(parsed)) payload.minOverdueAmount = parsed;
    }
    if (maxOverdueAmount != null) {
      const parsed = parseFloat(maxOverdueAmount);
      if (!Number.isNaN(parsed)) payload.maxOverdueAmount = parsed;
    }
    if (delinquentDaysMin != null) {
      const parsed = parseInt(delinquentDaysMin, 10);
      if (!Number.isNaN(parsed)) payload.delinquentDaysMin = parsed;
    }
    if (delinquentDaysMax != null) {
      const parsed = parseInt(delinquentDaysMax, 10);
      if (!Number.isNaN(parsed)) payload.delinquentDaysMax = parsed;
    }

    const data = await this.delinquencyService.getLoanDelinquencyList(payload);
    return { statusCode: 200, message: 'OK', data };
  }

  @Post('loan-delinquency/sync')
  @CheckPolicies(ability => ability.can(Action.Update, 'Loan'))
  @ApiOperation({ summary: 'Đồng bộ loan_delinquency hàng loạt' })
  @ApiResponse({ status: 200 })
  async syncLoanDelinquencyBatch(@Query('limit') limit?: string) {
    const parsed = limit != null ? parseInt(limit, 10) : NaN;
    const max = Number.isNaN(parsed) ? 200 : Math.min(Math.max(parsed, 1), 500);
    const data = await this.delinquencyService.syncLoanDelinquencyBatch(max);
    return { statusCode: 200, message: 'Đồng bộ loan_delinquency xong', data };
  }

  @Post('loan-delinquency/:fineractLoanId/sync')
  @CheckPolicies(ability => ability.can(Action.Update, 'Loan'))
  @ApiOperation({ summary: 'Đồng bộ loan_delinquency cho 1 khoản vay' })
  @ApiResponse({ status: 200 })
  async syncOneLoanDelinquency(@Param('fineractLoanId', ParseIntPipe) fineractLoanId: number) {
    const data = await this.delinquencyService.syncOneLoanDelinquency(fineractLoanId);
    return { statusCode: 200, message: 'Đồng bộ loan_delinquency thành công', data };
  }

  @Get('policies/debt-groups')
  @CheckPolicies(ability => ability.can(Action.Read, 'Loan'))
  @ApiOperation({ summary: 'Danh sách debt_group từ Fineract delinquency ranges để cấu hình policy' })
  @ApiResponse({ status: 200 })
  async getDelinquencyPolicyDebtGroups() {
    const data = await this.delinquencyService.getDelinquencyPolicyDebtGroups();
    return { statusCode: 200, message: 'OK', data };
  }

  @Get('policies')
  @CheckPolicies(ability => ability.can(Action.Read, 'Loan'))
  @ApiOperation({ summary: 'Danh sách cấu hình xử lý nợ xấu (delinquency_policy)' })
  @ApiResponse({ status: 200 })
  async getDelinquencyPolicies(
    @Query('is_active') isActive?: string,
    @Query('debt_group') debtGroup?: string,
    @Query('loan_product_id') loanProductId?: string,
    @Query('collection_stage') collectionStage?: DelinquencyCollectionStage,
  ) {
    const parsedLoanProductId = loanProductId != null ? Number(loanProductId) : undefined;
    const data = await this.delinquencyService.getDelinquencyPolicies({
      is_active: isActive == null ? undefined : isActive === 'true',
      debt_group: debtGroup != null ? Number(debtGroup) : undefined,
      loan_product_id: Number.isFinite(parsedLoanProductId) ? parsedLoanProductId : undefined,
      collection_stage: collectionStage,
    });
    return { statusCode: 200, message: 'OK', data };
  }

  @Post('policies')
  @CheckPolicies(ability => ability.can(Action.Update, 'Loan'))
  @ApiOperation({ summary: 'Tạo cấu hình xử lý nợ xấu' })
  @ApiResponse({ status: 201 })
  async createDelinquencyPolicy(@Body() dto: CreateDelinquencyPolicyDto) {
    const data = await this.delinquencyService.createDelinquencyPolicy(dto);
    return { statusCode: 201, message: 'Created', data };
  }

  @Put('policies/:id')
  @CheckPolicies(ability => ability.can(Action.Update, 'Loan'))
  @ApiOperation({ summary: 'Cập nhật cấu hình xử lý nợ xấu' })
  @ApiResponse({ status: 200 })
  async updateDelinquencyPolicy(@Param('id') id: string, @Body() dto: UpdateDelinquencyPolicyDto) {
    const data = await this.delinquencyService.updateDelinquencyPolicy(id, dto);
    return { statusCode: 200, message: 'Updated', data };
  }

  @Delete('policies/:id')
  @CheckPolicies(ability => ability.can(Action.Update, 'Loan'))
  @ApiOperation({ summary: 'Xóa cấu hình xử lý nợ xấu' })
  @ApiResponse({ status: 200 })
  async removeDelinquencyPolicy(@Param('id') id: string) {
    const data = await this.delinquencyService.removeDelinquencyPolicy(id);
    return { statusCode: 200, message: 'Deleted', data };
  }
}
