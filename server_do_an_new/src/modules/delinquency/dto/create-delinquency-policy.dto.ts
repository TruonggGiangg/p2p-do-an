import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { DelinquencyCollectionStage } from '../entities/delinquency-policy.schema';
export class CreateDelinquencyPolicyDto {
  @IsInt()
  @Min(1)
  debt_group: number;

  @IsOptional()
  @IsString()
  debt_group_name?: string;

  @IsBoolean()
  send_email: boolean;

  @IsBoolean()
  send_sms: boolean;

  @IsBoolean()
  send_notification: boolean;

  @IsBoolean()
  apply_penalty: boolean;

  @IsBoolean()
  block_new_loan: boolean;

  @IsEnum(DelinquencyCollectionStage)
  collection_stage: DelinquencyCollectionStage;

  @IsOptional()
  @IsBoolean()
  legal_escalation?: boolean;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;

  @IsOptional()
  @IsString()
  description?: string;
}
