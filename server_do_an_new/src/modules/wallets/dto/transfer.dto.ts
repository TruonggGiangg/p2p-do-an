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
        description: 'Nội dung chuyển khoản',
        example: 'Chuyển tiền ăn trưa',
    })
    @IsOptional()
    @IsString()
    description?: string;
}
