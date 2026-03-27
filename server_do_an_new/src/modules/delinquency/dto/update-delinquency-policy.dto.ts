import { PartialType } from '@nestjs/swagger';
import { CreateDelinquencyPolicyDto } from './create-delinquency-policy.dto';

export class UpdateDelinquencyPolicyDto extends PartialType(CreateDelinquencyPolicyDto) {}
