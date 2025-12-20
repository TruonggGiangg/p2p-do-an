import {
    IsNumber,
    IsString,
    IsNotEmpty,
    IsDateString,
    IsOptional,
    Min,
    Max,
    ValidateNested,
    IsObject,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Credit Assessment DTO (Optional)
 * Dữ liệu đánh giá tín dụng từ client
 */
export class CreditAssessmentDto {
    @ApiPropertyOptional({ description: 'Assessment data từ ML model' })
    @IsOptional()
    @IsObject()
    assessmentData?: Record<string, any>;

    @ApiPropertyOptional({ description: 'Credit score' })
    @IsOptional()
    @IsNumber()
    score?: number;
}

/**
 * Create Loan DTO
 * Dữ liệu để tạo khoản vay mới
 */
export class CreateLoanDto {
    @ApiProperty({
        description: 'Số tiền vay (VND)',
        minimum: 1000000,
        maximum: 500000000,
        example: 10000000,
    })
    @IsNumber()
    @Min(1000000, { message: 'Số tiền vay tối thiểu là 1,000,000 VND' })
    @Max(500000000, { message: 'Số tiền vay tối đa là 500,000,000 VND' })
    capital: number;

    @ApiProperty({
        description: 'Kỳ hạn vay (tháng)',
        minimum: 1,
        maximum: 60,
        example: 12,
    })
    @IsNumber()
    @Min(1, { message: 'Kỳ hạn vay tối thiểu là 1 tháng' })
    @Max(60, { message: 'Kỳ hạn vay tối đa là 60 tháng' })
    periodMonth: number;

    @ApiProperty({
        description: 'Lý do vay / Mục đích sử dụng',
        example: 'Mua sắm đồ dùng gia đình',
    })
    @IsString()
    @IsNotEmpty({ message: 'Vui lòng nhập lý do vay' })
    willing: string;

    @ApiProperty({
        description: 'Ngày giải ngân dự kiến (ISO date string)',
        example: '2025-01-15',
    })
    @IsDateString({}, { message: 'Ngày giải ngân không hợp lệ' })
    disbursementDate: string;

    @ApiPropertyOptional({
        description: 'Dữ liệu đánh giá tín dụng (optional)',
        type: CreditAssessmentDto,
    })
    @IsOptional()
    @ValidateNested()
    @Type(() => CreditAssessmentDto)
    creditAssessment?: CreditAssessmentDto;
}
