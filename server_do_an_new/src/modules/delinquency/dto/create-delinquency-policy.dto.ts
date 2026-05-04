import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { DelinquencyCollectionStage } from '../entities/delinquency-policy.schema';

export class CreateDelinquencyPolicyDto {
  @ApiProperty({ example: 1, description: 'ID sản phẩm vay' })
  @IsInt()
  @Min(1)
  loan_product_id: number;

  @ApiPropertyOptional({ example: 'Vay tiêu dùng' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  loan_product_name?: string;

  @ApiProperty({ example: 1, description: 'Nhóm nợ' })
  @IsInt()
  @Min(1)
  debt_group: number;

  @ApiPropertyOptional({ example: 'Nợ đủ tiêu chuẩn' })
  @IsOptional()
  @IsString()
  debt_group_name?: string;

  @ApiProperty({ example: true, description: 'Gửi email' })
  @IsBoolean()
  send_email: boolean;

  @ApiProperty({ example: true, description: 'Gửi tin nhắn SMS' })
  @IsBoolean()
  send_sms: boolean;

  @ApiProperty({ example: true, description: 'Gửi In-app Notification' })
  @IsBoolean()
  send_notification: boolean;

  @ApiProperty({ example: true, description: 'Áp dụng phí trễ hạn' })
  @IsBoolean()
  apply_penalty: boolean;

  @ApiProperty({ example: true, description: 'Chặn mở khoản vay mới' })
  @IsBoolean()
  block_new_loan: boolean;

  @ApiProperty({ enum: DelinquencyCollectionStage, example: DelinquencyCollectionStage.REMINDER, description: 'Giai đoạn thu hồi nợ' })
  @IsEnum(DelinquencyCollectionStage)
  collection_stage: DelinquencyCollectionStage;

  @ApiPropertyOptional({ example: false, description: 'Đã khởi kiện' })
  @IsOptional()
  @IsBoolean()
  legal_escalation?: boolean;

  @ApiPropertyOptional({
    example: 12,
    nullable: true,
    description: 'Số tháng lưu vết nợ quá hạn; null/rỗng/0 = lưu vĩnh viễn.',
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === '' || value == null) return null;
    const numeric = Number(value);
    return Number.isFinite(numeric) ? Math.trunc(numeric) : value;
  })
  @IsInt()
  @Min(0)
  retention_months?: number | null;

  @IsOptional()
  @IsBoolean()
  freeze_account?: boolean;

  @IsOptional()
  @IsBoolean()
  permanent_ban?: boolean;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;

  @ApiPropertyOptional({ example: 'Chính sách này áp dụng cho nợ dưới 10 ngày' })
  @IsOptional()
  @IsString()
  description?: string;
}
