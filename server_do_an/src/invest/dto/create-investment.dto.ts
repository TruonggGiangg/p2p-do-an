import { IsNumber, IsString, IsOptional, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateInvestmentDto {
    @ApiProperty({ description: 'Contract ID của khoản vay muốn đầu tư' })
    @IsString()
    loanContractId: string;

    @ApiProperty({ description: 'Số tiền đầu tư (VND)' })
    @IsNumber()
    @Min(100000, { message: 'Số tiền đầu tư tối thiểu 100,000 VND' })
    capital: number;

    @ApiPropertyOptional({ description: 'Số notes muốn mua' })
    @IsNumber()
    @IsOptional()
    numNotes?: number;
}
