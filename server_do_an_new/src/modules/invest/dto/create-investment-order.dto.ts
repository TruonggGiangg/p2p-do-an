import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNumber, IsArray, IsString, IsOptional,
  Min, ValidateNested, ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';

class RangeDto {
  @ApiProperty({ example: 1 })
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  min: number;

  @ApiProperty({ example: 18 })
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  max: number;
}

export class CreateInvestmentOrderDto {
  @ApiPropertyOptional({ description: 'Tên lệnh đầu tư (tùy chọn)', example: 'Lệnh tháng 3' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({ description: 'Tổng vốn đầu tư (VND)', example: 10_000_000 })
  @IsNumber()
  @Min(100_000, { message: 'Vốn đầu tư phải >= 100,000 VND' })
  @Type(() => Number)
  capital: number;

  @ApiProperty({ description: 'Giới hạn vốn tối đa cho mỗi khoản vay', example: 50_000_000 })
  @IsNumber()
  @Min(100_000, { message: 'Vốn tối đa phải >= 100,000 VND' })
  @Type(() => Number)
  maxCapital: number;

  @ApiProperty({ description: 'Khoảng lãi suất chấp nhận (%/tháng)', type: RangeDto })
  @ValidateNested()
  @Type(() => RangeDto)
  interestRange: RangeDto;

  @ApiProperty({ description: 'Mục đích đầu tư', example: ['Kinh doanh', 'Mua xe'] })
  @IsArray()
  @ArrayMinSize(1, { message: 'Phải chọn ít nhất 1 mục đích' })
  @IsString({ each: true })
  purpose: string[];

  @ApiProperty({ description: 'Khoảng kỳ hạn chấp nhận (tháng)', type: RangeDto })
  @ValidateNested()
  @Type(() => RangeDto)
  periodRange: RangeDto;
}
