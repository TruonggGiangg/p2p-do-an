/**
 * JobsController — REST API for admin job management
 * Pattern: HD-AMC p2p_vite BackgroundJobsService endpoints
 */

import {
  Controller, Get, Post, Put, Param, Body, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JobManagerService } from './job-manager.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';

@ApiTags('background-jobs')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles('admin')
@Controller('admin/background-jobs')
export class JobsController {
  constructor(private readonly jobManager: JobManagerService) {}

  @Get()
  @ApiOperation({ summary: 'Danh sách tất cả background jobs + status' })
  async getJobs() {
    return this.jobManager.getStatus();
  }

  @Get(':name')
  @ApiOperation({ summary: 'Chi tiết 1 job' })
  async getJob(@Param('name') name: string) {
    return this.jobManager.getJobStatus(name);
  }

  @Post(':name/start')
  @ApiOperation({ summary: 'Bật job' })
  async startJob(@Param('name') name: string) {
    const status = await this.jobManager.startJob(name);
    return status ;
  }

  @Post(':name/stop')
  @ApiOperation({ summary: 'Tắt job' })
  async stopJob(@Param('name') name: string) {
    const status = await this.jobManager.stopJob(name);
    return status ;
  }

  @Post(':name/run')
  @ApiOperation({ summary: 'Chạy job ngay lập tức' })
  async runJob(@Param('name') name: string) {
    const status = await this.jobManager.runJobNow(name);
    return status ;
  }

  @Put(':name/params')
  @ApiOperation({ summary: 'Cập nhật cấu hình job' })
  async updateParams(@Param('name') name: string, @Body() params: Record<string, any>) {
    const status = await this.jobManager.updateParams(name, params);
    return status ;
  }
}
