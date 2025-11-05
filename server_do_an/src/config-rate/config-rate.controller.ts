import {
  Controller,
  Put,
  Get,
  Body,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ConfigRateService } from './services/config-rate.service';
import { UpdateConfigRateDto } from './dto/update-config-rate.dto';
import { Roles } from '@auth/decorators/roles.decorator';
import { Role } from '@auth/roles/role.enum';
import { RolesGuard } from '@auth/guard/roles.guard';
import { ResponseMessage } from '@decorator/customize';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBody,
  ApiBearerAuth,
} from '@nestjs/swagger';

@ApiTags('Config Rate')
@ApiBearerAuth()
@Controller('config-rate')
@UseGuards(RolesGuard)
export class ConfigRateController {
  constructor(private readonly configRateService: ConfigRateService) {}

  @Put()
  @Roles(Role.ADMIN)
  @ResponseMessage('Cập nhật cấu hình hệ số tính lãi thành công')
  @ApiOperation({
    summary: 'Cập nhật cấu hình hệ số tính lãi (Admin only)',
    description:
      'Cập nhật các hệ số tính lãi suất trên blockchain. Chỉ admin mới có quyền thực hiện. Có thể cập nhật một hoặc nhiều hệ số: factorConstant, ficoCoefficient, capitalCoefficient, monthCoefficient.',
  })
  @ApiBody({ type: UpdateConfigRateDto })
  @ApiResponse({
    status: 200,
    description: 'Cập nhật cấu hình thành công',
    schema: {
      example: {
        statusCode: 200,
        message: 'Cập nhật cấu hình hệ số tính lãi thành công',
        data: {
          message: 'Cập nhật cấu hình thành công',
          config: {
            factorConstant: 16,
            ficoCoefficient: 0.01,
          },
          result: 'Config updated successfully',
        },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Dữ liệu không hợp lệ hoặc thiếu field',
  })
  @ApiResponse({
    status: 401,
    description: 'Chưa đăng nhập hoặc token không hợp lệ',
  })
  @ApiResponse({
    status: 403,
    description: 'Không có quyền truy cập (chỉ ADMIN)',
  })
  async updateConfig(
    @Request() req: any,
    @Body() updateConfigDto: UpdateConfigRateDto,
  ) {
    console.log('=== [ConfigRateController] updateConfig - START ===');
    console.log('[ConfigRateController] Request user:', req.user?.email);
    console.log('[ConfigRateController] Request user role:', req.user?.role);
    console.log('[ConfigRateController] Update config DTO:', JSON.stringify(updateConfigDto, null, 2));

    const result = await this.configRateService.updateConfig(updateConfigDto);

    console.log('[ConfigRateController] Update result:', JSON.stringify(result, null, 2));
    console.log('=== [ConfigRateController] updateConfig - END ===');

    return result;
  }

  @Get()
  @Roles(Role.ADMIN, Role.BORROWER, Role.LENDER)
  @ResponseMessage('Lấy cấu hình hệ số tính lãi thành công')
  @ApiOperation({
    summary: 'Lấy cấu hình hệ số tính lãi hiện tại',
    description:
      'Lấy cấu hình các hệ số tính lãi suất hiện tại từ blockchain. Tất cả user đều có thể xem.',
  })
  @ApiResponse({
    status: 200,
    description: 'Lấy cấu hình thành công',
    schema: {
      example: {
        statusCode: 200,
        message: 'Lấy cấu hình hệ số tính lãi thành công',
        data: {
          factorConstant: 15,
          ficoCoefficient: 0.01,
          capitalCoefficient: 0.000001,
          monthCoefficient: 0.1,
        },
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Chưa đăng nhập hoặc token không hợp lệ',
  })
  async getConfig(@Request() req: any) {
    console.log('=== [ConfigRateController] getConfig - START ===');
    console.log('[ConfigRateController] Request user:', req.user?.email);
    console.log('[ConfigRateController] Request user role:', req.user?.role);

    const result = await this.configRateService.getConfig();

    console.log('[ConfigRateController] Current config:', JSON.stringify(result, null, 2));
    console.log('=== [ConfigRateController] getConfig - END ===');

    return result;
  }
}

