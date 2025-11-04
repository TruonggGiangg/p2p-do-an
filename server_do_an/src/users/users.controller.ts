import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Put,
  UseGuards,
  Query,
} from '@nestjs/common';
import { UsersService } from '@users/users.service';
import { CreateUserDto } from '@users/dto/create-user.dto';
import { UpdateUserDto } from '@users/dto/update-user.dto';
import type { iUser } from '@users/user.interface';
import { ResponseMessage, User } from '@decorator/customize';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBody,
  ApiParam,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';

@ApiTags('Users')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @ApiOperation({ summary: 'Tạo người dùng mới' })
  @ApiResponse({ status: 201, description: 'Tạo người dùng thành công.' })
  @ApiBody({ type: CreateUserDto })
  @ResponseMessage('Tạo người dùng')
  @Post()
  async create(@Body() user: CreateUserDto, @User() user_create: iUser) {
    return await this.usersService.create(user, user_create);
  }

  @ApiOperation({ summary: 'Lấy danh sách tất cả người dùng' })
  @ApiResponse({ status: 200, description: 'Danh sách người dùng.' })
  @Throttle({ default: { limit: 3, ttl: 3000, blockDuration: 3000 } })
  @Get()
  @ResponseMessage('Lấy danh sách tất cả người dùng')
  findAll(
    @Query('current') currentPage: string,
    @Query('pageSize') limit: string,
    @Query() qs: string,
  ) {
    return this.usersService.findAll(+currentPage, +limit, qs);
  }

  @ApiOperation({ summary: 'Lấy người dùng theo id' })
  @ApiResponse({ status: 200, description: 'Thông tin người dùng.' })
  @ApiParam({ name: 'id', required: true })
  @Get(':id')
  @ResponseMessage('Lấy người dùng bằng id')
  findOne(@Param('id') id: string) {
    const data = this.usersService.findOne(id);
    return data;
  }

  @ApiOperation({ summary: 'Cập nhật người dùng' })
  @ApiResponse({ status: 200, description: 'Cập nhật người dùng thành công.' })
  @ApiParam({ name: 'id', required: true })
  @ApiBody({ type: UpdateUserDto })
  @Put(':id')
  @ResponseMessage('Cập nhật người dùng')
  async update(
    @Param('id') id: string,
    @User() user: iUser,
    @Body() updateUserDto: UpdateUserDto,
  ) {
    const updateUser = await this.usersService.update(id, updateUserDto, user);
    return {
      message: 'Cập nhật người dùng thành công',
      data: updateUser,
    };
  }

  @ApiOperation({ summary: 'Xóa người dùng' })
  @ApiResponse({ status: 200, description: 'Xóa người dùng thành công.' })
  @ApiParam({ name: 'id', required: true })
  @Delete(':id')
  @ResponseMessage('Xóa người dùng')
  async remove(@Param('id') id: string, @User() user: iUser) {
    return await this.usersService.remove(id, user);
  }
}
