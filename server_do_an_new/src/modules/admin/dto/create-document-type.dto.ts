import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { FileFormat } from '../schemas/document-type.schema';

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

  @ApiPropertyOptional({
    enum: FileFormat,
    default: FileFormat.ANY,
    description: 'Định dạng file cho phép: image, pdf, hoặc any (cả hai)',
  })
  @IsOptional()
  @IsEnum(FileFormat)
  fileFormat?: FileFormat;
}
