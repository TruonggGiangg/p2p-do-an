import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Length, Matches } from 'class-validator';

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
