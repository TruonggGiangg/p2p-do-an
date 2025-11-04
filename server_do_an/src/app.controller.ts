import { AppService } from './app.service';
import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { LocalAuthGuard } from '@auth/guard/local-guard.strategy';
import { AuthService } from '@auth/auth.service';
import { JwtAuthGuard } from '@auth/guard/jwt-guard.strategy';
import { Public, ResponseMessage, User } from '@decorator/customize';
import { RegisterUserDto } from '@users/dto/create-user.dto';
import type { iUser } from '@users/user.interface';
import type { Request, Response } from 'express';
import { GoogleAuthGuard } from '@auth/guard/google-guard.strategy';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBody,
  ApiBearerAuth,
} from '@nestjs/swagger';
@ApiTags('Auth')
@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly authService: AuthService,
  ) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }


  @Get('google')
  @Public()
  @UseGuards(GoogleAuthGuard)
  async googleAuth() {
    // Không cần xử lý gì — Passport sẽ redirect sang Google
  }

  @Public()
  @Get('google/redirect')
  @UseGuards(GoogleAuthGuard)
  async googleAuthRedirect(@Req() req) {
    const payloadAndToken = await this.authService.validateOAuthLogin(
      req.user as iUser,
    );
    return {
      message: 'Đăng nhập Google thành công',
      user: {
        email: req.user.email,
        name: req.user.name,
        picture: req.user.picture,
      },
      ...payloadAndToken,
    };
  }





}
