import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsMongoId, IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';

export class RegisterDto {
  @ApiProperty({ example: 'Nguyễn', description: 'Họ và tên đệm' })
  @IsString()
  @IsNotEmpty()
  firstName: string;

  @ApiProperty({ example: 'Văn A', description: 'Tên của người dùng' })
  @IsString()
  @IsNotEmpty()
  lastName: string;

  @ApiProperty({
    example: '0123456789',
    description: 'Số điện thoại đăng ký (10 chữ số)',
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(10)
  phoneNumber: string;

  @ApiPropertyOptional({
    example: 'user@example.com',
    description: 'Địa chỉ email (không bắt buộc)',
  })
  @IsString()
  @IsOptional()
  email?: string;

  @ApiProperty({
    example: 'SecurePassword123',
    description: 'Mật khẩu đăng nhập (tối thiểu 6 ký tự)',
  })
  @IsString()
  @MinLength(6)
  password: string;

  @ApiPropertyOptional({
    enum: ['borrower', 'lender', 'staff'],
    example: 'borrower',
    description: 'Loại người dùng (người vay hoặc người cho vay hoặc nhân viên)',
  })
  @IsEnum(['borrower', 'lender', 'staff'])
  @IsOptional()
  userType?: 'borrower' | 'lender' | 'staff';

  @ApiPropertyOptional({
    description: 'Role ID trong collection roles (dùng cho luồng admin tạo nhân viên)',
  })
  @IsMongoId()
  @IsOptional()
  roleId?: string;
}

export class RefreshTokenDto {
  @ApiPropertyOptional({ description: 'Refresh token (for mobile apps)' })
  @IsString()
  @IsOptional()
  refreshToken?: string;
}
