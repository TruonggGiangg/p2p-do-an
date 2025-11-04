import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { AuthService } from '@auth/auth.service';
import { UsersService } from '@users/users.service';
import { Strategy } from 'passport-local';

@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy) {
  constructor(
    private authService: AuthService,
    private usersService: UsersService,
  ) {
    super({
      usernameField: 'identifier', // Accept 'identifier' instead of 'username'
      passwordField: 'password',
    });
  }

  /**
   * Validate user credentials.
   * Called automatically by Passport when LocalAuthGuard is used.
   * @param identifier - phone or email
   * @param password - plain password
   * @returns user object if valid, throws UnauthorizedException otherwise
   */
  async validate(identifier: string, password: string): Promise<any> {
    // Find user by phone or email
    const user = await this.usersService.findOneByPhoneOrEmail(identifier);
    if (!user) {
      throw new UnauthorizedException('Tài khoản không tồn tại');
    }

    // Verify password
    const isValidPassword = this.usersService.isValidPass(password, user.password);
    if (!isValidPassword) {
      throw new UnauthorizedException('Mật khẩu không đúng');
    }

    // Return user (Passport will attach to req.user)
    return user;
  }
}

