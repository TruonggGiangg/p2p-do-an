import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsEnum, IsOptional, IsString, MinLength, ValidateIf } from 'class-validator';
import { DocumentFieldType } from '../schemas/document-type.schema';

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
    enum: DocumentFieldType,
    default: DocumentFieldType.FILE,
    description: 'Loại trường nhập liệu',
  })
  @IsOptional()
  @IsEnum(DocumentFieldType)
  fieldType?: DocumentFieldType;

  @ApiPropertyOptional({ type: [String], description: 'Danh sách giá trị lựa chọn (cho select/button)' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ValidateIf(o => o.fieldType === DocumentFieldType.SELECT || o.fieldType === DocumentFieldType.BUTTON)
  options?: string[];
}
