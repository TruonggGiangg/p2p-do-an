import { PartialType } from '@nestjs/swagger';
import { CreateInvestmentOrderDto } from './create-investment-order.dto';

export class UpdateInvestmentOrderDto extends PartialType(CreateInvestmentOrderDto) {}
