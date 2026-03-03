import { IsNotEmpty, IsString, IsOptional, IsEnum, IsMongoId } from 'class-validator';
import { SignatureProvider } from '../schemas/digital-signature.schema';

/**
 * DTO khởi tạo yêu cầu ký số cho 1 hợp đồng
 * Client gửi contractId → Server tạo phiên ký → trả về thông tin để SDK SmartCA embedded mở
 */
export class InitiateSigningDto {
  @IsMongoId()
  @IsNotEmpty()
  contractId: string;

  @IsEnum(SignatureProvider)
  @IsOptional()
  provider?: SignatureProvider = SignatureProvider.VNPT_SMARTCA;
}
