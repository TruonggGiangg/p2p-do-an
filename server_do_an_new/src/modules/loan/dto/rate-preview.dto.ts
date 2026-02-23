import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class RatePreviewDto {
  @ApiProperty({ description: 'Số tiền vay (VND)' })
  @IsNumber()
  @Min(100000)
  @Type(() => Number)
  capital: number;

  @ApiProperty({ description: 'Số tháng vay' })
  @IsNumber()
  @Min(1)
  @Max(60)
  @Type(() => Number)
  periodMonth: number;

  @ApiProperty({ description: 'ID sản phẩm vay (Fineract)' })
  @IsNumber()
  @Type(() => Number)
  productId: number;

  @ApiPropertyOptional({ description: 'Lãi suất %/tháng (tùy chọn, mặc định lấy từ sản phẩm)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(20)
  @Type(() => Number)
  monthlyRatePercent?: number;
}
