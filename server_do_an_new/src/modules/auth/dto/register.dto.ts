import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';

export class RegisterDto {
  @ApiProperty({ example: 'Nguyen', description: 'First name' })
  @IsString()
  @IsNotEmpty()
  firstName: string;

  @ApiProperty({ example: 'Van A', description: 'Last name' })
  @IsString()
  @IsNotEmpty()
  lastName: string;

  @ApiProperty({
    example: '0123456789',
    description: 'Phone number (10-11 digits)',
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(10)
  phoneNumber: string;

  @ApiPropertyOptional({
    example: 'user@example.com',
    description: 'Email address',
  })
  @IsString()
  @IsOptional()
  email?: string;

  @ApiProperty({
    example: 'SecurePassword123',
    description: 'Password (minimum 6 characters)',
  })
  @IsString()
  @MinLength(6)
  password: string;

  @ApiPropertyOptional({
    enum: ['borrower', 'lender'],
    example: 'borrower',
    description: 'User type (borrower or lender)',
  })
  @IsEnum(['borrower', 'lender'])
  @IsOptional()
  userType?: 'borrower' | 'lender';
}

export class RefreshTokenDto {
  @ApiPropertyOptional({ description: 'Refresh token (for mobile apps)' })
  @IsString()
  @IsOptional()
  refreshToken?: string;
}
