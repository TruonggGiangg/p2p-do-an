import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsNumber, IsOptional } from 'class-validator';

/**
 * Confirm Transfer DTO
 * Dữ liệu cần thiết để xác thực và thực thi một phiên chuyển tiền bằng Smart OTP
 */
export class ConfirmTransferDto {
  @ApiProperty({ description: 'ID của phiên OTP đã khởi tạo' })
  @IsNotEmpty()
  @IsString()
  sessionId: string;

  @ApiProperty({ description: 'Mã OTP (6 chữ số)' })
  @IsNotEmpty()
  @IsString()
  otp: string;

  @ApiProperty({ description: 'Chữ ký số ECDSA' })
  @IsNotEmpty()
  @IsString()
  signature: string;

  @ApiProperty({ description: 'ID thiết bị thực hiện ký' })
  @IsNotEmpty()
  @IsString()
  deviceId: string;

  @ApiProperty({ description: 'Timestamp tại thời điểm ký (ms)' })
  @IsNotEmpty()
  @IsNumber()
  timestamp: number;

  @ApiProperty({ description: 'Địa chỉ IP (tùy chọn)', required: false })
  @IsOptional()
  @IsString()
  ipAddress?: string;
}
