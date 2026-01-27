import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsObject, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class DeviceFingerprintDto {
  @ApiProperty({ example: 'ABC123XYZ', description: 'Unique device identifier' })
  @IsString()
  @IsNotEmpty()
  deviceId: string;

  @ApiProperty({ example: 'iPhone 15 Pro', required: false })
  @IsString()
  deviceName?: string;

  @ApiProperty({ example: 'iOS', required: false })
  @IsString()
  os?: string;

  @ApiProperty({ example: '17.0', required: false })
  @IsString()
  osVersion?: string;

  @ApiProperty({ example: 'iPhone', required: false })
  @IsString()
  model?: string;

  @ApiProperty({ example: 'Apple', required: false })
  @IsString()
  brand?: string;

  @ApiProperty({ example: '123', required: false })
  @IsString()
  buildNumber?: string;

  @ApiProperty({ example: '1.0.0', required: false })
  @IsString()
  appVersion?: string;
}

export class RegisterDeviceDto {
  @ApiProperty({
    example: '04a1b2c3d4e5f6...',
    description: 'ECDSA public key (hex format)',
  })
  @IsString()
  @IsNotEmpty()
  publicKey: string;

  @ApiProperty({ type: DeviceFingerprintDto })
  @IsObject()
  @ValidateNested()
  @Type(() => DeviceFingerprintDto)
  deviceFingerprint: DeviceFingerprintDto;
}
