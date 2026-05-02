import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString, IsArray, Min, Max, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class DocumentItemDto {
  @ApiProperty()
  @IsString()
  documentTypeId: string;

  @ApiProperty()
  @IsString()
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  uri?: string;
}

export class ApplyLoanDto {
  @ApiProperty()
  @IsNumber()
  @Min(100000)
  @Type(() => Number)
  capital: number;

  @ApiProperty()
  @IsNumber()
  @Min(1)
  @Max(60)
  @Type(() => Number)
  periodMonth: number;

  @ApiProperty()
  @IsNumber()
  @Type(() => Number)
  productId: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(20)
  @Type(() => Number)
  monthlyRatePercent?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  willing?: string;

  @ApiProperty({ description: 'Ngày giải ngân dự kiến (YYYY-MM-DD)' })
  @IsString()
  disbursementDate: string;

  @ApiProperty({ description: 'ID ví nhận giải ngân (MongoDB Wallet _id)' })
  @IsString()
  disbursementWalletId: string;

  @ApiPropertyOptional({ type: [DocumentItemDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DocumentItemDto)
  documents?: DocumentItemDto[];

  @ApiPropertyOptional({ description: 'Smart OTP session ID (bắt buộc khi đã bật Smart OTP)' })
  @IsOptional()
  @IsString()
  otpSessionId?: string;

  // ── AI Scoring inputs (bắt buộc cho models_final) ──

  @ApiProperty({ description: 'Thu nhập hàng tháng của người vay (VND)' })
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  personIncome: number;

  @ApiProperty({ description: 'Số năm kinh nghiệm làm việc' })
  @IsNumber()
  @Min(0)
  @Max(60)
  @Type(() => Number)
  personEmpExp: number;

  @ApiPropertyOptional({ description: 'Trình độ học vấn (High School, Bachelor, Master, Associate, Doctorate)' })
  @IsOptional()
  @IsString()
  personEducation?: string;

  @ApiPropertyOptional({ description: 'Tình trạng sở hữu nhà (RENT, OWN, MORTGAGE, OTHER)' })
  @IsOptional()
  @IsString()
  personHomeOwnership?: string;
}
