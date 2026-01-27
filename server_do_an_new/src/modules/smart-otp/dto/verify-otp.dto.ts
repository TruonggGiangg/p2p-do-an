import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsEnum, IsNumber, Min } from 'class-validator';
import { OtpActionType } from '../enums/otp-action-type.enum';

export class VerifyOtpDto {
  @ApiProperty({ example: 'uuid-session-id', description: 'OTP session ID' })
  @IsString()
  @IsNotEmpty()
  sessionId: string;

  @ApiProperty({ example: '123456', description: '6-digit OTP code' })
  @IsString()
  @IsNotEmpty()
  otp: string;

  @ApiProperty({
    example: 'base64-signature',
    description: 'ECDSA signature (base64 encoded)',
  })
  @IsString()
  @IsNotEmpty()
  signature: string;

  @ApiProperty({
    example: 1704067200,
    description: 'Unix timestamp when signature was created',
  })
  @IsNumber()
  @Min(0)
  timestamp: number;

  @ApiProperty({ example: 'ABC123XYZ', description: 'Device ID' })
  @IsString()
  @IsNotEmpty()
  deviceId: string;

  @ApiProperty({
    enum: OtpActionType,
    example: OtpActionType.LOAN_CREATE,
    description: 'Type of action',
  })
  @IsEnum(OtpActionType)
  @IsNotEmpty()
  actionType: OtpActionType;
}
