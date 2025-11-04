// src/auth/strategies/google.strategy.ts
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, VerifyCallback } from 'passport-google-oauth20';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(private readonly configService: ConfigService) {
    super({
      clientID: configService.get<string>('GOOGLE_CLIENT_ID') as string,
      clientSecret: configService.get<string>('GOOGLE_CLIENT_SECRET') as string,
      callbackURL: configService.get<string>('GOOGLE_CALLBACK_URL') as string,
      scope: ['email', 'profile'],
    });
  }

  //khi xác thực thành công, Passport sẽ gọi hàm này với thông tin người dùng từ Google
  //Chúng ta sẽ lấy thông tin người dùng và trả về cho AuthService để xử lý tiếp, inject thộng tin người dùng vài req.user
  async validate(
    accessToken: string,
    refreshToken: string,
    profile: any,
    done: VerifyCallback,
  ): Promise<any> {
    const { name, emails, photos } = profile;
    const user = {
      email: emails[0].value,
      name: name.givenName + ' ' + name.familyName,
      picture: photos[0].value,
      accessToken,
    };
    done(null, user);
  }
}
