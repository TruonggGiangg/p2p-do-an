import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

export class CreateBnplApplicationDto {
  @ApiPropertyOptional({
    description: 'Han muc BNPL mong muon',
    minimum: 500000,
    maximum: 50000000,
    example: 5000000,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(500000)
  @Max(50000000)
  requestedLimit?: number;

  @ApiPropertyOptional({
    description: 'Thu nhap hang thang khai bao',
    minimum: 0,
    example: 12000000,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  income?: number;

  @ApiPropertyOptional({ description: 'Nghe nghiep', example: 'Nhan vien van phong' })
  @IsOptional()
  @IsString()
  occupation?: string;

  @ApiPropertyOptional({ description: 'Muc dich su dung BNPL', example: 'Mua laptop' })
  @IsOptional()
  @IsString()
  purpose?: string;

  @ApiPropertyOptional({ description: 'Dia chi hien tai' })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional({
    description: 'Ky han mong muon tinh theo thang',
    minimum: 1,
    maximum: 12,
    example: 6,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(12)
  requestedTermMonths?: number;
}
