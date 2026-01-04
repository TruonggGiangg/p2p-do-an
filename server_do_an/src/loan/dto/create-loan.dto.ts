import {
    IsNumber,
    IsString,
    IsNotEmpty,
    IsDateString,
    IsOptional,
    Min,
    Max,
    ValidateNested,
    IsIn,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Digital Footprint DTO
 * Dữ liệu dấu vân tay số từ thiết bị để chấm điểm tín dụng
 */
export class DigitalFootprintDto {
    @ApiPropertyOptional({ description: 'Mức pin thiết bị (0-100)', example: 75 })
    @IsOptional()
    @IsNumber()
    @Min(0)
    @Max(100)
    battery_level?: number;

    @ApiPropertyOptional({ description: 'Giờ gửi yêu cầu (0-23)', example: 14 })
    @IsOptional()
    @IsNumber()
    @Min(0)
    @Max(23)
    submission_hour?: number;

    @ApiPropertyOptional({ description: 'Loại kết nối mạng', example: 'wifi' })
    @IsOptional()
    @IsString()
    @IsIn(['wifi', '4g', 'unknown'])
    connection_type?: 'wifi' | '4g' | 'unknown';

    @ApiPropertyOptional({ description: 'Đã cấp quyền vị trí', example: 'true' })
    @IsOptional()
    @IsString()
    @IsIn(['true', 'false'])
    location_match?: 'true' | 'false';

    @ApiPropertyOptional({ description: 'Điểm thiết bị (0-100)', example: 60 })
    @IsOptional()
    @IsNumber()
    @Min(0)
    @Max(100)
    device_score?: number;
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
        description: 'Dữ liệu dấu vân tay số từ thiết bị (Digital Footprint)',
        type: DigitalFootprintDto,
    })
    @IsOptional()
    @ValidateNested()
    @Type(() => DigitalFootprintDto)
    digitalFootprint?: DigitalFootprintDto;
}

/**
 * Pre-Assess DTO
 * Chấm điểm tín dụng TRƯỚC khi tạo khoản vay
 */
export class PreAssessDto {
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
        description: 'Mục đích vay',
        example: 'Mua sắm',
    })
    @IsOptional()
    @IsString()
    willing?: string;

    @ApiProperty({
        description: 'Dữ liệu dấu vân tay kỹ thuật số',
        type: DigitalFootprintDto,
    })
    @ValidateNested()
    @Type(() => DigitalFootprintDto)
    footprint: DigitalFootprintDto;
}
