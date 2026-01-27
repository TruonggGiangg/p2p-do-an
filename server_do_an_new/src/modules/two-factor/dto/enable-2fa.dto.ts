import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Length } from 'class-validator';

export class Enable2faDto {
  @ApiProperty({
    example: 'JBSWY3DPEHPK3PXP',
    description: 'TOTP secret (Base32) from /2fa/secret',
  })
  @IsString()
  @IsNotEmpty()
  secret: string;

  @ApiProperty({
    example: '123456',
    description: '6-digit OTP code from authenticator app',
  })
  @IsString()
  @IsNotEmpty()
  @Length(6, 6)
  token: string;
}
