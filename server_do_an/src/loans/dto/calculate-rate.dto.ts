import { IsNumber, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class CalculateRateDto {
  @ApiProperty({
    description: 'Số tiền vay (VNĐ)',
    example: 10000000,
    minimum: 1000000,
  })
  @IsNumber()
  @Type(() => Number)
  @Min(1000000, { message: 'Số tiền vay tối thiểu là 1,000,000 VNĐ' })
  capital: number;

  @ApiProperty({
    description: 'Kỳ hạn vay (tháng)',
    example: 12,
    minimum: 1,
    maximum: 60,
  })
  @IsNumber()
  @Type(() => Number)
  @Min(1, { message: 'Kỳ hạn vay tối thiểu là 1 tháng' })
  @Max(60, { message: 'Kỳ hạn vay tối đa là 60 tháng' })
  periodMonth: number;

  @ApiProperty({
    description: 'Điểm tín dụng (credit score)',
    example: 750,
    minimum: 0,
    maximum: 1000,
  })
  @IsNumber()
  @Type(() => Number)
  @Min(0, { message: 'Điểm tín dụng không được nhỏ hơn 0' })
  @Max(1000, { message: 'Điểm tín dụng không được lớn hơn 1000' })
  score: number;
}

