import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { DelinquencyCollectionStage } from '../entities/delinquency-policy.schema';
export class UpdateDelinquencyPolicyDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  loan_product_id?: number;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  loan_product_name?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  debt_group?: number;

  @IsOptional()
  @IsString()
  debt_group_name?: string;

  @IsOptional()
  @IsBoolean()
  send_email?: boolean;

  @IsOptional()
  @IsBoolean()
  send_sms?: boolean;

  @IsOptional()
  @IsBoolean()
  send_notification?: boolean;

  @IsOptional()
  @IsBoolean()
  apply_penalty?: boolean;

  @IsOptional()
  @IsBoolean()
  block_new_loan?: boolean;

  @IsOptional()
  @IsEnum(DelinquencyCollectionStage)
  collection_stage?: DelinquencyCollectionStage;

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
