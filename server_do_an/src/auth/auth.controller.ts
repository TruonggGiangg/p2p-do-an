import { 
  Body, 
  Controller, 
  Delete, 
  Post, 
  Get,
  Req, 
  Res, 
  BadRequestException,
  InternalServerErrorException,
  UnauthorizedException,
  UseGuards,
  Patch,
  HttpException,
} from '@nestjs/common';
import { AuthService } from '@auth/auth.service';
import { UsersService } from '@users/users.service';
import { OtpService } from '@auth/otp/otp.service';
import { PhoneHelper } from '../utils/phone.helper';
import { LocalAuthGuard } from '@auth/guard/local-auth.guard';
import { JwtAuthGuard } from '@auth/guard/jwt-guard.strategy';
import type { Response, Request } from 'express';
import { Role } from '@auth/roles/role.enum';
import { Public, ResponseMessage, User } from '@decorator/customize';
import { Roles } from '@auth/decorators/roles.decorator';
import { SignUpDto, ConfirmDto, SignInDto } from '@auth/dto/auth.dto';
import type { iUser } from '@users/user.interface';
import { EnhancedRolesGuard } from '@auth/guard/enhanced-roles.guard';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly usersService: UsersService,
    private readonly otpService: OtpService,
  ) {}

  @Public()
  @Post('signup')
  @ResponseMessage('Gửi mã xác thực thành công')
  async signup(@Body() body: SignUpDto) {
    const { phone } = body;
    
    // Validate phone format
    if (!PhoneHelper.validatePhone(phone)) {
      throw new BadRequestException('Số điện thoại không hợp lệ');
    }
    
    // Check if user exists (check both phone formats)
    const email = PhoneHelper.phoneToEmail(phone);
    const exists = await this.usersService.findOneByEmail(email);
    if (exists) {
      throw new BadRequestException('Số điện thoại đã được đăng ký');
    }
    
    // Send OTP
    const success = await this.otpService.sendOtp(phone);
    if (!success) {
      throw new InternalServerErrorException('Không thể gửi mã xác thực');
    }
    
    return { 
      phone,
      message: 'Mã xác thực đã được gửi'
    };
  }

  @Public()
  @Post('confirm')
  @ResponseMessage('Đăng ký tài khoản thành công')
  async confirm(@Body() body: ConfirmDto, @Res() res: Response) {
    const { 
      phone, 
      password, 
      category, 
      code,
      fullName,
      dateOfBirth,
      gender,
      address,
      city,
      ssn,
      job,
      income
    } = body;
    
    try {
      // Verify OTP
      const validOtp = await this.otpService.verifyOtp(phone, code);
      if (!validOtp) {
        throw new BadRequestException('Mã xác thực không đúng hoặc đã hết hạn');
      }
      
      // Map category to role
      const mappedRole: Role =
        category === 'borrower' ? Role.BORROWER : 
        category === 'lender' ? Role.LENDER : 
        Role.ADMIN;

      const email = PhoneHelper.phoneToEmail(phone);

      // Double-check user doesn't exist
      const existed = await this.usersService.findOneByEmail(email);
      if (existed) {
        throw new BadRequestException('Tài khoản đã tồn tại');
      }

      // Validate password
      if (!password || password.length < 6) {
        throw new BadRequestException('Mật khẩu phải có ít nhất 6 ký tự');
      }

      // Validate required fields
      if (!fullName || !dateOfBirth || !gender) {
        throw new BadRequestException('Vui lòng điền đầy đủ thông tin bắt buộc');
      }

      // Create user with full profile details
      const user = await this.usersService.register({
        name: fullName, // Use full name from request
        email,
        password,
        age: 0, // Can be extracted from dateOfBirth if needed
        gender,
        address,
        role: mappedRole,
        phone,
        category,
        isBusiness: false,
        isActive: true,
        profile: {
          declared: true,
          fullName,
          dateOfBirth: new Date(dateOfBirth),
          gender,
          address,
          city,
          ssn,
          job,
          income,
          createdAt: new Date(),
        },
      } as any);

      // Login user
      const loginRes = await this.authService.login(user, res);

      // Set authorization header for client
      res.setHeader('Authorization', `Bearer ${loginRes.accessToken}`);

      const responseData = {
        _id: user._id,
        phone: user.phone,
        email: user.email,
        category: user.category,
        detail: { 
          declared: true,
          fullName: user.profile?.fullName,
          address: user.profile?.address,
          city: user.profile?.city,
        },
      };

      return res.status(200).json({
        statusCode: 200,
        message: 'Đăng ký tài khoản thành công',
        data: responseData,
        accessToken: loginRes.accessToken,
        refreshToken: loginRes.refreshToken,
        timestamp: new Date().toISOString(),
        path: '/auth/confirm',
      });
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException('Lỗi trong quá trình đăng ký tài khoản');
    }
  }

  @Public()
  @UseGuards(LocalAuthGuard)
  @Post('signin')
  @ResponseMessage('Đăng nhập thành công')
  async signin(@Req() req: Request, @Res() res: Response) {
    /**
     * LocalAuthGuard validates credentials via LocalStrategy.
     * User is attached to req.user by Passport if valid.
     * If invalid, LocalAuthGuard throws UnauthorizedException.
     */
    const user = (req as any).user;
    
    if (!user) {
      throw new UnauthorizedException('Xác thực thất bại');
    }

    try {
      // Generate tokens
      const loginRes = await this.authService.login(user, res);

      // Set Authorization header with access token
      res.setHeader('Authorization', `Bearer ${loginRes.accessToken}`);

      const responseData = {
        _id: user._id,
        phone: user.phone,
        email: user.email,
        category: user.category,
        detail: { declared: !!user?.profile?.declared },
      };

      return res.status(200).json({
        statusCode: 200,
        message: 'Đăng nhập thành công',
        data: responseData,
        accessToken: loginRes.accessToken,
        refreshToken: loginRes.refreshToken,
        timestamp: new Date().toISOString(),
        path: '/auth/signin',
      });
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException('Lỗi trong quá trình đăng nhập');
    }
  }

  @Delete('signout')
  @ResponseMessage('Đăng xuất thành công')
  async signout(@User() user: iUser, @Res({ passthrough: true }) res: Response) {
    if (!user) {
      throw new UnauthorizedException('Không tìm thấy thông tin người dùng');
    }
    
    try {
      await this.authService.logout(user, res);
      return {
        message: 'Đăng xuất thành công',
        data: null,
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException('Lỗi trong quá trình đăng xuất');
    }
  }

  @Public()
  @Post('refresh')
  @ResponseMessage('Làm mới token thành công')
  async refreshToken(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    try {
      const refreshToken = req.cookies['refreshToken'];
      if (!refreshToken) {
        throw new UnauthorizedException('Refresh token không tồn tại');
      }
      const result = await this.authService.refreshToken(refreshToken, res);
      return {
        message: 'Làm mới token thành công',
        data: result,
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new UnauthorizedException('Refresh token không hợp lệ');
    }
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ResponseMessage('Lấy thông tin người dùng hiện tại')
  async getMe(@User() user: iUser) {
    if (!user) {
      throw new UnauthorizedException('Không tìm thấy thông tin người dùng');
    }
    return {
      message: 'Lấy thông tin người dùng thành công',
      data: user
    };
  }

  @Get('profile')
  @UseGuards(JwtAuthGuard)
  @ResponseMessage('Get user profile')
  async getProfile(@User() user: iUser) {
    const userDetail = await this.usersService.findOne(user._id);
    return {
      feature: 'profile',
      code: 200,
      data: {
        ...userDetail,
        profile: userDetail?.profile || {}
      }
    };
  }

  @Get('account')
  @UseGuards(JwtAuthGuard)
  @ResponseMessage('Get account info')
  async getAccount(@User() user: iUser) {
    return {
      feature: 'account',
      code: 200,
      data: {
        ...user,
      }
    };
  }

  // ==================== ROLE PERMISSION TEST ENDPOINTS ====================

  /**
   * TEST ENDPOINT: GET /auth/test-admin
   * Only ADMIN can access this endpoint
   */
  @Get('test-admin')
  @UseGuards(JwtAuthGuard, EnhancedRolesGuard)
  @Roles(Role.ADMIN)
  @ResponseMessage('Admin only endpoint')
  async testAdminAccess(@User() user: iUser) {
    return {
      feature: 'test-admin',
      code: 200,
      data: {
        message: '✅ Admin có quyền truy cập',
        user: {
          _id: user._id,
          email: user.email,
          role: user.role,
          category: user.category,
        }
      }
    };
  }

  /**
   * TEST ENDPOINT: GET /auth/test-lender
   * Only LENDER can access this endpoint
   */
  @Get('test-lender')
  @UseGuards(JwtAuthGuard, EnhancedRolesGuard)
  @Roles(Role.LENDER)
  @ResponseMessage('Lender only endpoint')
  async testLenderAccess(@User() user: iUser) {
    return {
      feature: 'test-lender',
      code: 200,
      data: {
        message: '✅ Lender có quyền truy cập',
        user: {
          _id: user._id,
          email: user.email,
          role: user.role,
          category: user.category,
        }
      }
    };
  }

  /**
   * TEST ENDPOINT: GET /auth/test-borrower
   * Only BORROWER can access this endpoint
   */
  @Get('test-borrower')
  @UseGuards(JwtAuthGuard, EnhancedRolesGuard)
  @Roles(Role.BORROWER)
  @ResponseMessage('Borrower only endpoint')
  async testBorrowerAccess(@User() user: iUser) {
    return {
      feature: 'test-borrower',
      code: 200,
      data: {
        message: '✅ Borrower có quyền truy cập',
        user: {
          _id: user._id,
          email: user.email,
          role: user.role,
          category: user.category,
        }
      }
    };
  }

  /**
   * TEST ENDPOINT: GET /auth/test-both-roles
   * Both LENDER and BORROWER can access this endpoint
   */
  @Get('test-both-roles')
  @UseGuards(JwtAuthGuard, EnhancedRolesGuard)
  @Roles(Role.LENDER, Role.BORROWER)
  @ResponseMessage('Lender or Borrower endpoint')
  async testBothRolesAccess(@User() user: iUser) {
    return {
      feature: 'test-both-roles',
      code: 200,
      data: {
        message: `✅ ${user.role} có quyền truy cập`,
        user: {
          _id: user._id,
          email: user.email,
          role: user.role,
          category: user.category,
        }
      }
    };
  }

  /**
   * TEST ENDPOINT: GET /auth/test-public
   * Everyone (including guest) can access this endpoint
   */
  @Public()
  @Get('test-public')
  @ResponseMessage('Public endpoint')
  async testPublicAccess() {
    return {
      feature: 'test-public',
      code: 200,
      data: {
        message: '✅ Guest có quyền truy cập endpoint công khai',
        timestamp: new Date().toISOString()
      }
    };
  }

  /**
   * TEST ENDPOINT: GET /auth/test-authenticated
   * All authenticated users can access this endpoint
   */
  @Get('test-authenticated')
  @UseGuards(JwtAuthGuard)
  @ResponseMessage('Authenticated users only')
  async testAuthenticatedAccess(@User() user: iUser) {
    return {
      feature: 'test-authenticated',
      code: 200,
      data: {
        message: '✅ Tất cả user đã xác thực có quyền truy cập',
        user: {
          _id: user._id,
          email: user.email,
          role: user.role,
          category: user.category,
        }
      }
    };
  }
}


