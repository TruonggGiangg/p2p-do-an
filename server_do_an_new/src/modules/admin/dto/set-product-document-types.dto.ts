import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsNumber, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class ProductDocumentTypeItemDto {
  @ApiProperty({ description: 'MongoDB ObjectId of DocumentType' })
  @IsString()
  documentTypeId: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsNumber()
  sortOrder?: number;
}

export class SetProductDocumentTypesDto {
  @ApiProperty({ type: [ProductDocumentTypeItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductDocumentTypeItemDto)
  items: ProductDocumentTypeItemDto[];
}
