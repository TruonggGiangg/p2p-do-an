import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ConfigRate, ConfigRateDocument } from '../schemas/config-rate.schema';
import { UpdateConfigRateDto } from '../dto/update-config-rate.dto';

@Injectable()
export class ConfigRateService {
  private readonly logger = new Logger(ConfigRateService.name);

  constructor(
    @InjectModel(ConfigRate.name)
    private configRateModel: Model<ConfigRateDocument>,
  ) {}

  /**
   * Lấy config active từ MongoDB
   */
  async getActiveConfig(): Promise<ConfigRateDocument> {
    console.log('=== [ConfigRateService] getActiveConfig - START ===');

    let config = await this.configRateModel.findOne({ isActive: true }).exec();

    if (!config) {
      // Nếu chưa có config active, tạo config mặc định
      console.log('[ConfigRateService] No active config found, creating default config');
      config = new this.configRateModel({
        name: 'default',
        factorConstant: 15,
        ficoCoefficient: 0.01,
        capitalCoefficient: 0.000001,
        monthCoefficient: 0.1,
        isActive: true,
      });
      await config.save();
    }

    console.log('[ConfigRateService] Active config:', JSON.stringify(config, null, 2));
    console.log('=== [ConfigRateService] getActiveConfig - END ===');

    return config;
  }

  /**
   * Cập nhật cấu hình hệ số tính lãi trong MongoDB
   */
  async updateConfig(updateConfigDto: UpdateConfigRateDto): Promise<any> {
    console.log('=== [ConfigRateService] updateConfig - START ===');
    console.log('[ConfigRateService] Config update:', JSON.stringify(updateConfigDto, null, 2));

    // Validate: Phải có ít nhất 1 field được cập nhật
    const hasValidField = Object.keys(updateConfigDto).some(
      (key) => updateConfigDto[key] !== undefined,
    );
    if (!hasValidField) {
      throw new BadRequestException(
        'Phải có ít nhất một hệ số được cập nhật (factorConstant, ficoCoefficient, capitalCoefficient, monthCoefficient)',
      );
    }

    try {
      // Lấy config active hiện tại
      let config = await this.configRateModel.findOne({ isActive: true }).exec();

      if (!config) {
        // Nếu chưa có config, tạo mới
        config = new this.configRateModel({
          name: 'default',
          ...updateConfigDto,
          isActive: true,
        });
      } else {
        // Cập nhật config hiện tại
        Object.assign(config, updateConfigDto);
      }

      await config.save();

      console.log('[ConfigRateService] Config updated in MongoDB:', JSON.stringify(config, null, 2));
      console.log('=== [ConfigRateService] updateConfig - END ===');

      return {
        message: 'Cập nhật cấu hình thành công',
        config: {
          factorConstant: config.factorConstant,
          ficoCoefficient: config.ficoCoefficient,
          capitalCoefficient: config.capitalCoefficient,
          monthCoefficient: config.monthCoefficient,
        },
      };
    } catch (error) {
      console.error('[ConfigRateService] ERROR:', error);
      this.logger.error(`Failed to update config: ${error}`);
      throw new BadRequestException(
        `Không thể cập nhật cấu hình: ${error.message}`,
      );
    }
  }

  /**
   * Lấy cấu hình hiện tại từ MongoDB
   */
  async getConfig(): Promise<any> {
    console.log('=== [ConfigRateService] getConfig - START ===');

    const config = await this.getActiveConfig();

    console.log('[ConfigRateService] Current config:', JSON.stringify(config, null, 2));
    console.log('=== [ConfigRateService] getConfig - END ===');

    return {
      factorConstant: config.factorConstant,
      ficoCoefficient: config.ficoCoefficient,
      capitalCoefficient: config.capitalCoefficient,
      monthCoefficient: config.monthCoefficient,
    };
  }
}

