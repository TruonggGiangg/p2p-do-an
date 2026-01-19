import { IsNumber, Min, Max, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * DTO for BNPL Loan Preview
 * Calculate repayment schedule before loan creation
 */
export class PreviewBnplLoanDto {
  @ApiProperty({
    description: 'Loan amount (VND)',
    minimum: 500000,
    maximum: 50000000,
    example: 5000000,
  })
  @IsNumber()
  @Min(500000)
  @Max(50000000)
  amount: number;

  @ApiPropertyOptional({
    description: 'Number of repayment periods (months)',
    minimum: 1,
    maximum: 12,
    default: 3,
    example: 3,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(12)
  numberOfRepayments?: number;
}
