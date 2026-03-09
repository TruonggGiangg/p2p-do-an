import { Controller, Post, Body, Req, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { UserPayload } from '../auth/interfaces/auth.interface';

@ApiTags('users')
@Controller('users')
@ApiBearerAuth('access-token')
export class UsersController {
    constructor(private readonly usersService: UsersService) { }

    @Post('push-token')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Register or update Expo push token' })
    @ApiResponse({ status: 200, description: 'Token updated successfully' })
    async updatePushToken(
        @CurrentUser() user: UserPayload,
        @Body('pushToken') pushToken: string,
    ) {
        if (!user._id) return { success: false, message: 'User ID not found' };
        await this.usersService.updatePushToken(user._id, pushToken);
        return { success: true, message: 'Push token updated' };
    }
}
