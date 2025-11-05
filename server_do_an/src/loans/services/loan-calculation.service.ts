import { Injectable } from '@nestjs/common';

interface LoanCalculationConfig {
  factorConstant: number;
  ficoCoefficient: number;
  capitalCoefficient: number;
  monthCoefficient: number;
}

interface LoanSchedule {
  rate: number;
  monthlyPrincipal: number;
  monthlyInterest: number;
  monthlyPayment: number;
  totalPayment: number;
}

@Injectable()
export class LoanCalculationService {
  private dataConstant: LoanCalculationConfig = {
    factorConstant: 15,
    ficoCoefficient: 0.01,
    capitalCoefficient: 0.000001,
    monthCoefficient: 0.1,
  };

  /**
   * Tính toán lãi suất dựa trên điểm tín dụng
   * Logic từ chaincode: calculateLoanRate
   */
  calculateLoanRate(
    capital: number,
    periodMonth: number,
    score: number,
  ): number {
    const {
      factorConstant,
      ficoCoefficient,
      monthCoefficient,
    } = this.dataConstant;

    // Tính lãi suất dựa trên các yếu tố: điểm tín dụng, số tiền vay và Kỳ hạn vay
    // Capital cao -> lãi suất thấp hơn (trừ thay vì cộng)
    const capitalDiscount =
      Math.log10(capital / 1000000) * 0.5; // Giảm 0.5% cho mỗi 10x capital

    const rate =
      factorConstant - // Hằng số cơ bản
      ficoCoefficient * score - // Giảm lãi suất nếu điểm tín dụng cao
      capitalDiscount - // Capital cao -> giảm lãi suất
      monthCoefficient * periodMonth; // Điều chỉnh lãi suất theo Kỳ hạn vay

    // Giới hạn lãi suất trong khoảng hợp lý (3% - 25%)
    const minRate = 3;
    const maxRate = 25;
    const finalRate = Math.max(minRate, Math.min(maxRate, rate));

    return Math.round(finalRate * 100) / 100;
  }

  /**
   * Tính toán khoản vay tự động
   * Logic từ chaincode: calculateLoanSchedule
   */
  calculateLoanSchedule(
    capital: number,
    periodMonth: number,
    score: number,
  ): LoanSchedule {
    const rate = this.calculateLoanRate(capital, periodMonth, score);

    // Tính gốc hàng tháng
    const monthlyPrincipal = Math.round(capital / periodMonth);

    // Tính lãi hàng tháng (lãi đơn)
    const monthlyInterest = Math.round(
      (monthlyPrincipal * rate) / 100,
    );

    // Tổng thanh toán hàng tháng
    const monthlyPayment = monthlyPrincipal + monthlyInterest;

    const totalPayment = monthlyPayment * periodMonth;

    return {
      rate,
      monthlyPrincipal,
      monthlyInterest,
      monthlyPayment,
      totalPayment,
    };
  }

  /**
   * Cập nhật cấu hình hệ số từ admin
   */
  setConfig(newConfig: Partial<LoanCalculationConfig>): void {
    this.dataConstant = {
      ...this.dataConstant,
      ...newConfig,
    };
  }

  /**
   * Lấy cấu hình hiện tại
   */
  getConfig(): LoanCalculationConfig {
    return { ...this.dataConstant };
  }
}

