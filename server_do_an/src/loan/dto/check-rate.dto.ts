import {
    IsNumber,
    IsString,
    IsDateString,
    IsOptional,
    Min,
    Max,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Check Rate DTO
 * Dữ liệu để kiểm tra/preview lãi suất trước khi tạo khoản vay
 */
export class CheckRateDto {
    @ApiProperty({
        description: 'Số tiền vay (VND)',
        minimum: 1000000,
        maximum: 500000000,
        example: 10000000,
    })
    @IsNumber()
    @Min(1000000)
    @Max(500000000)
    capital: number;

    @ApiProperty({
        description: 'Kỳ hạn vay (tháng)',
        minimum: 1,
        maximum: 60,
        example: 12,
    })
    @IsNumber()
    @Min(1)
    @Max(60)
    periodMonth: number;

    @ApiPropertyOptional({
        description: 'Lý do vay (optional)',
        example: 'Mua sắm',
    })
    @IsOptional()
    @IsString()
    willing?: string;

    @ApiPropertyOptional({
        description: 'Ngày giải ngân dự kiến (optional)',
        example: '2025-01-15',
    })
    @IsOptional()
    @IsDateString()
    disbursementDate?: string;
}
