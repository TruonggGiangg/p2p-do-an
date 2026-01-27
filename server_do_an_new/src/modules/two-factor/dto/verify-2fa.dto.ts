import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Length } from 'class-validator';

export class Verify2faDto {
  @ApiProperty({
    example: '123456',
    description: '6-digit OTP code from authenticator app',
  })
  @IsString()
  @IsNotEmpty()
  @Length(6, 6)
  token: string;
}
