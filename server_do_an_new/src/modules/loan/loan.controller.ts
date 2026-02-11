import { Controller, Get, UseGuards, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { LoanService } from './loan.service';

@ApiTags('loan')
@ApiBearerAuth()
@Controller('loan')
@UseGuards(JwtAuthGuard)
export class LoanController {
    constructor(private readonly loanService: LoanService) { }

    @Get('products')
    @ApiOperation({ summary: 'Lấy danh sách sản phẩm vay từ Fineract' })
    @ApiResponse({ status: 200, description: 'Trả về danh sách sản phẩm vay' })
    async getLoanProducts() {
        const products = await this.loanService.getLoanProducts();

        return {
            statusCode: HttpStatus.OK,
            message: 'Danh sách sản phẩm vay',
            data: {
                products,
                count: products.length,
            },
        };
    }
}
