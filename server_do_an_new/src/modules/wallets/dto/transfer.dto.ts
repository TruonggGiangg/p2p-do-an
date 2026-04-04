import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class TransferDto {
    @ApiProperty({
        description: 'ID ví nguồn (Fineract Savings ID)',
        example: '1',
    })
    @IsString()
    @IsNotEmpty()
    fromWalletId: string;

    @ApiProperty({
        description: 'ID ví đích (Fineract Savings ID)',
        example: '2',
    })
    @IsString()
    @IsNotEmpty()
    toWalletId: string;

    @ApiProperty({
        description: 'Số tiền cần chuyển (tối thiểu 1,000đ)',
        example: 10000,
        minimum: 1000,
    })
    @IsNumber()
    @Min(1000, { message: 'Số tiền tối thiểu là 1,000 đ' })
    amount: number;

    @ApiPropertyOptional({
        description: 'Mô tả giao dịch',
        example: 'Chuyển quỹ nội bộ',
    })
    @IsOptional()
    @IsString()
    description?: string;

    @ApiProperty({
        description: 'ID thiết bị thực hiện giao dịch (để khởi tạo Smart OTP)',
        example: 'device-uuid-123',
    })
    @IsString()
    @IsNotEmpty()
    deviceId: string;
}
