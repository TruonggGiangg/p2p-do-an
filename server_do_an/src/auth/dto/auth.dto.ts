/**
 * Auth DTOs - Data Transfer Objects với validation
 * 
 * Pattern: DTO Validation
 * - Validate input data trước khi xử lý
 * - class-validator decorators
 */

import { IsString, IsNotEmpty, IsEmail, IsOptional, MinLength, MaxLength, Matches } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * DTO for registration request
 */
export class RegisterDto {
    @ApiProperty({ description: 'Username (phone number)', example: '0987654321' })
    @IsString()
    @IsNotEmpty({ message: 'Username không được để trống' })
    @Matches(/^0[0-9]{9}$/, { message: 'Username phải là số điện thoại Việt Nam hợp lệ (10 số, bắt đầu bằng 0)' })
    username: string;

    @ApiProperty({ description: 'Password', example: 'TestClient123@' })
    @IsString()
    @IsNotEmpty({ message: 'Password không được để trống' })
    @MinLength(12, { message: 'Password phải có ít nhất 12 ký tự' })
    @MaxLength(50, { message: 'Password không được quá 50 ký tự' })
    @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^a-zA-Z0-9\s]).+$/, {
        message: 'Password phải có ít nhất 1 chữ hoa, 1 chữ thường, 1 số và 1 ký tự đặc biệt',
    })
    password: string;

    @ApiProperty({ description: 'Email address', example: 'user@example.com' })
    @IsEmail({}, { message: 'Email không hợp lệ' })
    @IsNotEmpty({ message: 'Email không được để trống' })
    email: string;

    @ApiPropertyOptional({ description: 'First name', example: 'Nguyen' })
    @IsString()
    @IsOptional()
    firstName?: string;

    @ApiPropertyOptional({ description: 'Last name', example: 'Van A' })
    @IsString()
    @IsOptional()
    lastName?: string;
}

/**
 * DTO for password reset request
 */
export class ResetPasswordDto {
    @ApiProperty({ description: 'User ID (Keycloak)', example: 'f7a8b9c0-d1e2-3f45-g678-h9i0j1k2l3m4' })
    @IsString()
    @IsNotEmpty({ message: 'User ID không được để trống' })
    userId: string;

    @ApiProperty({ description: 'New password', example: 'NewPassword123@' })
    @IsString()
    @IsNotEmpty({ message: 'Password mới không được để trống' })
    @MinLength(12, { message: 'Password phải có ít nhất 12 ký tự' })
    @MaxLength(50, { message: 'Password không được quá 50 ký tự' })
    @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^a-zA-Z0-9\s]).+$/, {
        message: 'Password phải có ít nhất 1 chữ hoa, 1 chữ thường, 1 số và 1 ký tự đặc biệt',
    })
    newPassword: string;
}

/**
 * DTO for change password request
 */
export class ChangePasswordDto {
    @ApiProperty({ description: 'Current password', example: 'OldPassword123@' })
    @IsString()
    @IsNotEmpty({ message: 'Password hiện tại không được để trống' })
    currentPassword: string;

    @ApiProperty({ description: 'New password', example: 'NewPassword123@' })
    @IsString()
    @IsNotEmpty({ message: 'Password mới không được để trống' })
    @MinLength(12, { message: 'Password phải có ít nhất 12 ký tự' })
    @MaxLength(50, { message: 'Password không được quá 50 ký tự' })
    @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^a-zA-Z0-9\s]).+$/, {
        message: 'Password phải có ít nhất 1 chữ hoa, 1 chữ thường, 1 số và 1 ký tự đặc biệt',
    })
    newPassword: string;
}
