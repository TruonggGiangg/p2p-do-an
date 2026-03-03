import { Controller, Post, Get, Body, Param, Req, HttpCode, HttpStatus, Headers } from '@nestjs/common';
import { DigitalSignatureService } from './digital-signature.service';
import { InitiateSigningDto, SmartCaCallbackDto } from './dto';
import { Public } from '../../common/decorators/public.decorator';

/**
 * Controller quản lý chữ ký số
 *
 * Flow:
 *  1. POST /digital-signature/initiate   → Tạo phiên ký (user authenticated)
 *  2. POST /digital-signature/confirm     → Client xác nhận kết quả từ SDK SmartCA
 *  3. GET  /digital-signature/:id/status  → Polling trạng thái (fallback)
 *  4. POST /digital-signature/retry/:id   → Retry phiên ký bị fail
 *  5. POST /digital-signature/callback    → VNPT SmartCA webhook (public)
 *  6. GET  /digital-signature/contract/:contractCode → Lấy chữ ký của hợp đồng
 *  7. GET  /digital-signature/:id/verify  → Verify integrity
 */
@Controller('digital-signature')
export class DigitalSignatureController {
  constructor(private readonly signatureService: DigitalSignatureService) {}

  /**
   * Khởi tạo phiên ký số cho hợp đồng
   * Client gọi trước khi mở SDK SmartCA
   */
  @Post('initiate')
  @HttpCode(HttpStatus.OK)
  async initiateSigningRequest(@Body() dto: InitiateSigningDto, @Req() req: any) {
    const userId = req.user?.sub || req.user?.userId;
    const clientIp = req.ip || req.headers['x-forwarded-for'];
    const userAgent = req.headers['user-agent'];

    const result = await this.signatureService.initiateSigningRequest(dto.contractId, userId, { clientIp, userAgent });

    return {
      success: true,
      message: 'Phiên ký số đã được khởi tạo. Vui lòng mở SmartCA SDK để ký.',
      data: result,
    };
  }

  /**
   * Client xác nhận kết quả ký từ SDK SmartCA
   * SDK trả về kết quả → client gửi lên server để verify + finalize
   */
  @Post('confirm')
  @HttpCode(HttpStatus.OK)
  async confirmSigningResult(@Body() body: { signatureId: string; result: any }, @Req() req: any) {
    const userId = req.user?.sub || req.user?.userId;

    const signature = await this.signatureService.confirmSigningResult(body.signatureId, userId, body.result);

    return {
      success: true,
      message: signature.status === 'signed' ? 'Ký hợp đồng thành công!' : `Kết quả ký: ${signature.status}`,
      data: {
        status: signature.status,
        completedAt: signature.completedAt,
        signedFileUrl: signature.signedFileUrl,
      },
    };
  }

  /**
   * Polling trạng thái phiên ký
   */
  @Get(':id/status')
  async checkSigningStatus(@Param('id') signatureId: string, @Req() req: any) {
    const userId = req.user?.sub || req.user?.userId;
    const status = await this.signatureService.checkSigningStatus(signatureId, userId);

    return {
      success: true,
      data: status,
    };
  }

  /**
   * Retry phiên ký bị fail / expired
   */
  @Post('retry/:id')
  @HttpCode(HttpStatus.OK)
  async retrySigningRequest(@Param('id') signatureId: string, @Req() req: any) {
    const userId = req.user?.sub || req.user?.userId;
    const clientIp = req.ip || req.headers['x-forwarded-for'];
    const userAgent = req.headers['user-agent'];

    const result = await this.signatureService.retrySigningRequest(signatureId, userId, { clientIp, userAgent });

    return {
      success: true,
      message: 'Đã tạo phiên ký mới. Vui lòng mở SmartCA SDK để ký lại.',
      data: result,
    };
  }

  /**
   * VNPT SmartCA webhook callback
   * Public endpoint (không cần JWT)
   * Xác thực qua HMAC signature trong header
   */
  @Public()
  @Post('callback')
  @HttpCode(HttpStatus.OK)
  async handleSmartCaCallback(@Body() dto: SmartCaCallbackDto, @Headers('x-smartca-signature') _hmacSignature: string) {
    // TODO: Verify HMAC signature from VNPT SmartCA
    // const isValid = this.signatureService.verifyCallbackHmac(dto, hmacSignature);
    // if (!isValid) throw new UnauthorizedException('Invalid callback signature');

    await this.signatureService.handleCallback(dto.transactionId, dto);

    return { success: true, message: 'Callback received' };
  }

  /**
   * Lấy chữ ký số đã signed của hợp đồng
   */
  @Get('contract/:contractCode')
  async getSignatureByContract(@Param('contractCode') contractCode: string, @Req() req: any) {
    const userId = req.user?.sub || req.user?.userId;
    const signature = await this.signatureService.getSignatureByContract(contractCode, userId);

    return {
      success: true,
      data: signature,
    };
  }

  /**
   * Lấy lịch sử ký số của hợp đồng (bao gồm failed, retry)
   */
  @Get('contract/:contractCode/history')
  async getSignatureHistory(@Param('contractCode') contractCode: string, @Req() req: any) {
    const userId = req.user?.sub || req.user?.userId;
    const history = await this.signatureService.getSignatureHistory(contractCode, userId);

    return {
      success: true,
      data: history,
    };
  }

  /**
   * Verify tính toàn vẹn chữ ký (document hash check)
   */
  @Get(':id/verify')
  async verifySignatureIntegrity(@Param('id') signatureId: string) {
    const result = await this.signatureService.verifySignatureIntegrity(signatureId);

    return {
      success: true,
      data: {
        ...result,
        message: result.valid
          ? 'Chữ ký hợp lệ — nội dung hợp đồng không bị thay đổi'
          : 'CẢNH BÁO: Nội dung hợp đồng đã bị thay đổi sau khi ký!',
      },
    };
  }
}
