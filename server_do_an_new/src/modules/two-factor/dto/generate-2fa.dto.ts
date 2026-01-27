import { ApiProperty } from '@nestjs/swagger';

/**
 * Response DTO for generating 2FA secret
 */
export class Generate2faResponseDto {
  @ApiProperty({ example: 'JBSWY3DPEHPK3PXP', description: 'TOTP secret (Base32)' })
  secret: string;

  @ApiProperty({
    example: 'otpauth://totp/AppName:user@example.com?secret=JBSWY3DPEHPK3PXP&issuer=AppName',
    description: 'OTPAuth URL for QR code generation',
  })
  otpauthUrl: string;

  @ApiProperty({
    example: 'data:image/png;base64,iVBORw0KGgoAAAANS...',
    description: 'QR code image (base64)',
    required: false,
  })
  qrCodeUrl?: string;
}
