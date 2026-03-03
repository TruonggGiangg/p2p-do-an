import { IsNotEmpty, IsString, IsOptional, IsEnum } from 'class-validator';

/**
 * DTO cho VNPT SmartCA callback / webhook
 * VNPT gọi về server khi user ký xong hoặc từ chối
 */
export class SmartCaCallbackDto {
  @IsString()
  @IsNotEmpty()
  transactionId: string;

  /** Trạng thái từ VNPT: SUCCESS | FAILED | REJECTED | TIMEOUT */
  @IsString()
  @IsNotEmpty()
  status: string;

  /** Chữ ký số base64 (PKCS#7 / CMS format) */
  @IsString()
  @IsOptional()
  signatureValue?: string;

  /** Certificate PEM */
  @IsString()
  @IsOptional()
  signerCertificate?: string;

  /** Thông tin subject DN */
  @IsOptional()
  signerInfo?: {
    commonName?: string;
    serialNumber?: string;
    organization?: string;
    validFrom?: string;
    validTo?: string;
  };

  /** Error code nếu failed */
  @IsOptional()
  errorCode?: string;

  /** Error message nếu failed */
  @IsOptional()
  errorMessage?: string;

  /** URL file đã ký (nếu VNPT host) */
  @IsOptional()
  signedFileUrl?: string;

  /** Timestamp hoàn thành từ VNPT */
  @IsOptional()
  completedAt?: string;
}
