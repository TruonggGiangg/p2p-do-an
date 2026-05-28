import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';
import { BnplInterestType } from '../schemas/bnpl-policy-config.schema';

export class CreateBnplPolicyConfigDto {
  @ApiProperty({ description: 'ID sản phẩm loan Fineract dùng cho BNPL', example: 1 })
  @IsNumber()
  @Min(1)
  loanProductId: number;

  @ApiProperty({ description: 'Hạn mức BNPL mặc định', example: 5000000 })
  @IsNumber()
  @Min(0)
  creditLimit: number;

  @ApiProperty({ description: 'Kỳ hạn mặc định (tháng)', example: 3 })
  @IsNumber()
  @Min(1)
  @Max(12)
  defaultRepayments: number;

  @ApiProperty({ description: 'Kỳ hạn tối thiểu (tháng)', example: 1 })
  @IsNumber()
  @Min(1)
  @Max(12)
  minRepayments: number;

  @ApiProperty({ description: 'Kỳ hạn tối đa (tháng)', example: 12 })
  @IsNumber()
  @Min(1)
  @Max(12)
  maxRepayments: number;

  @ApiProperty({ description: 'Số tiền tối thiểu', example: 500000 })
  @IsNumber()
  @Min(0)
  minAmount: number;

  @ApiProperty({ description: 'Số tiền tối đa', example: 50000000 })
  @IsNumber()
  @Min(0)
  maxAmount: number;

  @ApiProperty({ description: 'Lãi suất theo tháng (%)', example: 1.5 })
  @IsNumber()
  @Min(0)
  monthlyRate: number;

  @ApiProperty({ description: 'Kiểu tính lãi', enum: BnplInterestType, example: BnplInterestType.DECLINING_BALANCE })
  @IsEnum(BnplInterestType)
  interestType: BnplInterestType;

  @ApiPropertyOptional({ description: 'Phí trễ hạn theo % trên kỳ quá hạn', example: 2 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  lateFeeRate?: number;

  @ApiPropertyOptional({ description: 'Phí trễ hạn cố định', example: 50000 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  lateFeeFlat?: number;

  @ApiPropertyOptional({ description: 'Số ngày ân hạn', example: 3 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  gracePeriodDays?: number;

  @ApiPropertyOptional({ description: 'Số khoản BNPL active tối đa', example: 3 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  maxActiveLoans?: number;

  @ApiPropertyOptional({ description: 'Cho phép tất toán sớm', example: true })
  @IsOptional()
  @IsBoolean()
  allowEarlyRepayment?: boolean;

  @ApiPropertyOptional({ description: 'Bước làm tròn tiền tệ', example: 1000 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  currencyMultiples?: number;

  @ApiPropertyOptional({ description: 'Ghi chú thay đổi policy', example: 'Điều chỉnh policy quý 2/2026' })
  @IsOptional()
  @IsString()
  changeNote?: string;
}
