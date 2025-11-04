// combined-auth.guard.ts
import { Injectable } from '@nestjs/common';
import { CanActivate, ExecutionContext } from '@nestjs/common';
import { JwtAuthGuard } from '@auth/guard/jwt-guard.strategy'; // Đảm bảo import đúng
import { ThrottlerGuard } from '@nestjs/throttler';

@Injectable()
export class CombinedAuthGuard implements CanActivate {
  constructor(
    private readonly jwtAuthGuard: JwtAuthGuard, // Đảm bảo JwtAuthGuard được inject chính xác
    private readonly throttlerGuard: ThrottlerGuard, // Đảm bảo ThrottlerGuard được inject chính xác
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const jwtResult = await this.jwtAuthGuard.canActivate(context); // Chạy JwtAuthGuard
    const throttlerResult = await this.throttlerGuard.canActivate(context); // Chạy ThrottlerGuard

    return jwtResult && throttlerResult; // Cả hai guard phải thành công
  }
}
