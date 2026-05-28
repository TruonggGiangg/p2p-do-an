import { IsNumber, IsOptional, IsString, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateBnplLoanDto {
  @ApiProperty({
    description: 'Số tiền vay (vốn gốc)',
    minimum: 500000,
    maximum: 50000000,
    example: 1000000,
  })
  @IsNumber()
  @Min(500000, { message: 'Số tiền vay tối thiểu là 500,000 VND' })
  @Max(50000000, { message: 'Số tiền vay tối đa là 50,000,000 VND' })
  amount: number;

  @ApiPropertyOptional({
    description: 'Mô tả giao dịch',
    example: 'Mua iPhone 15 Pro',
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    description: 'Mục đích vay BNPL',
    example: 'Mua sắm',
  })
  @IsOptional()
  @IsString()
  purpose?: string;

  @ApiPropertyOptional({
    description: 'Số kỳ trả nợ',
    minimum: 1,
    maximum: 24,
    default: 3,
    example: 3,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(24)
  numberOfRepayments?: number;
}
