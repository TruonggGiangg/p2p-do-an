import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class TransferByAccountDto {
    @ApiProperty({
        description: 'ID ví nguồn (Fineract Savings ID)',
        example: '1',
    })
    @IsString()
    @IsNotEmpty()
    fromWalletId: string;

    @ApiProperty({
        description: 'Số tài khoản Fineract người nhận',
        example: '000000001',
    })
    @IsString()
    @IsNotEmpty()
    recipientAccountNo: string;

    @ApiProperty({
        description: 'Số tiền cần chuyển (tối thiểu 1,000đ)',
        example: 50000,
        minimum: 1000,
    })
    @IsNumber()
    @Min(1000, { message: 'Số tiền tối thiểu là 1,000 đ' })
    amount: number;

    @ApiPropertyOptional({
        description: 'Nội dung chuyển khoản',
        example: 'Thanh toán hóa đơn',
    })
    @IsOptional()
    @IsString()
    description?: string;
}
