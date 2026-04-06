import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsOptional, IsString, Length, Min } from 'class-validator';

export class TransferByPhoneDto {
    @ApiProperty({
        description: 'ID ví nguồn (Fineract Savings ID)',
        example: '1',
    })
    @IsString()
    @IsNotEmpty()
    fromWalletId: string;

    @ApiProperty({
        description: 'Số điện thoại người nhận (10 chữ số)',
        example: '0987654321',
    })
    @IsString()
    @IsNotEmpty()
    @Length(10, 10, { message: 'Số điện thoại phải có 10 chữ số' })
    recipientPhone: string;

    @ApiProperty({
        description: 'Số tiền cần chuyển (tối thiểu 1,000đ)',
        example: 20000,
        minimum: 1000,
    })
    @IsNumber()
    @Min(1000, { message: 'Số tiền tối thiểu là 1,000 đ' })
    amount: number;

    @ApiPropertyOptional({
        description: 'Nội dung chuyển khoản',
        example: 'Trả tiền cafe',
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
