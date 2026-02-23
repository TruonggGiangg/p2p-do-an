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
}
