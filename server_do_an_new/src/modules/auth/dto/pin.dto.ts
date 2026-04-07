import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, Length, Matches } from 'class-validator';

export class SetupPinDto {
  @ApiProperty({
    example: '123456',
    description: 'Mã PIN 6 chữ số',
  })
  @IsString()
  @Length(6, 6, { message: 'Mã PIN phải đúng 6 chữ số' })
  @Matches(/^\d{6}$/, { message: 'Mã PIN chỉ gồm 6 chữ số' })
  pin: string;

  @ApiProperty({
    example: 'uuid-session-id',
    description: 'Smart OTP session ID đã xác thực',
  })
  @IsString()
  @IsNotEmpty()
  sessionId: string;
}

export class VerifyPinDto {
  @ApiProperty({ example: '123456', description: 'Mã PIN 6 chữ số' })
  @IsString()
  @Length(6, 6, { message: 'Mã PIN phải đúng 6 chữ số' })
  @Matches(/^\d{6}$/, { message: 'Mã PIN chỉ gồm 6 chữ số' })
  pin: string;
}

export class ChangePinDto {
  @ApiProperty({ example: '123456', description: 'Mã PIN cũ' })
  @IsString()
  @Length(6, 6, { message: 'Mã PIN phải đúng 6 chữ số' })
  @Matches(/^\d{6}$/, { message: 'Mã PIN chỉ gồm 6 chữ số' })
  oldPin: string;

  @ApiProperty({ example: '654321', description: 'Mã PIN mới' })
  @IsString()
  @Length(6, 6, { message: 'Mã PIN phải đúng 6 chữ số' })
  @Matches(/^\d{6}$/, { message: 'Mã PIN chỉ gồm 6 chữ số' })
  newPin: string;

  @ApiProperty({
    example: 'uuid-session-id',
    description: 'Smart OTP session ID đã xác thực',
  })
  @IsString()
  @IsNotEmpty()
  sessionId: string;
}

export class ResetPinDto {
  @ApiProperty({ example: '654321', description: 'Mã PIN mới' })
  @IsString()
  @Length(6, 6, { message: 'Mã PIN phải đúng 6 chữ số' })
  @Matches(/^\d{6}$/, { message: 'Mã PIN chỉ gồm 6 chữ số' })
  newPin: string;

  @ApiProperty({
    example: 'uuid-session-id',
    description: 'Smart OTP session ID đã xác thực',
  })
  @IsString()
  @IsNotEmpty()
  sessionId: string;
}
