import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNumber, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateDocumentTypeDto {
  @ApiProperty({ example: 'CMND/CCCD' })
  @IsString()
  @MinLength(1)
  name: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @ApiPropertyOptional({ description: 'Mô tả' })
  @IsOptional()
  @IsString()
  description?: string;
}
