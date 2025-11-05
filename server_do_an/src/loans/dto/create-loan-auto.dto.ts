import { IsString, IsNumber, IsOptional, IsDateString, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateLoanAutoDto {
  @IsNumber()
  @Type(() => Number)
  @Min(1000000, { message: 'Số tiền vay tối thiểu là 1,000,000 VNĐ' })
  capital: number;

  @IsNumber()
  @Type(() => Number)
  @Min(1, { message: 'Kỳ hạn vay tối thiểu là 1 tháng' })
  @Max(60, { message: 'Kỳ hạn vay tối đa là 60 tháng' })
  periodMonth: number;

  @IsString()
  willing: string;

  @IsOptional()
  @IsDateString()
  disbursementDate?: string;
}

