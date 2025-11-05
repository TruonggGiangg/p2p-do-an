import { IsOptional, IsNumber, Min, Max } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateConfigRateDto {
  @ApiProperty({
    description: 'Hằng số cơ bản dùng để điều chỉnh lãi suất nền',
    example: 15,
    required: false,
    minimum: 0,
    maximum: 100,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  factorConstant?: number;

  @ApiProperty({
    description: 'Hệ số điểm tín dụng (fico coefficient)',
    example: 0.01,
    required: false,
    minimum: 0,
    maximum: 1,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  ficoCoefficient?: number;

  @ApiProperty({
    description: 'Hệ số số tiền vay (capital coefficient)',
    example: 0.000001,
    required: false,
    minimum: 0,
    maximum: 1,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  capitalCoefficient?: number;

  @ApiProperty({
    description: 'Hệ số kỳ hạn vay (month coefficient)',
    example: 0.1,
    required: false,
    minimum: 0,
    maximum: 10,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(10)
  monthCoefficient?: number;
}

