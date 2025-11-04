import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly configService: ConfigService) {
    // Sử dụng ExtractJwt để lấy token từ header Authorization
    // Cấu hình secret key từ ConfigService
    // ignoreExpiration: false để kiểm tra thời gian hết hạn của token
    // jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken() để lấy token từ header Authorization
    // secretOrKey: lấy từ biến môi trường JWT_SECRET
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET') as string,
    });
  }

  // trả về payload của token sau khi xác thực
  // payload này sẽ được gán vào req.user trong JwtAuthGuard
  async validate(payload: any) {
    return { ...payload };
  }
}
