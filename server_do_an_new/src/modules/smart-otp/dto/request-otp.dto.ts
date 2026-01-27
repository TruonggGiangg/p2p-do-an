import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsEnum, IsObject, IsOptional } from 'class-validator';
import { OtpActionType } from '../enums/otp-action-type.enum';

export class RequestOtpDto {
  @ApiProperty({ example: 'ABC123XYZ', description: 'Device ID' })
  @IsString()
  @IsNotEmpty()
  deviceId: string;

  @ApiProperty({
    enum: OtpActionType,
    example: OtpActionType.LOAN_CREATE,
    description: 'Type of action requiring OTP',
  })
  @IsEnum(OtpActionType)
  @IsNotEmpty()
  actionType: OtpActionType;

  @ApiProperty({
    example: { loanAmount: 1000000, loanTerm: 12 },
    description: 'Transaction data',
    required: false,
  })
  @IsObject()
  @IsOptional()
  actionData?: Record<string, any>;
}
