import { Logger } from '@nestjs/common';

type AiscoreConfig = {
  serviceUrl?: string;
  timeout?: number;
  vndPerUsd?: number;
};

/**
 * Resolve VND → USD-equivalent scaling factor for AI scoring.
 *
 * QUAN TRỌNG: Đây KHÔNG phải tỷ giá USD thật (~26000) — mà là hệ số quy đổi để
 * dataset Việt Nam (VND) đáp đứng phân phối huấn luyện của model (USD US Kaggle).
 *
 * Dùng tỷ giá thật 26000 → loan 10M VND = 380 USD → model thấy nhỏ xíu → PD = 0%.
 * Dùng hệ số 1000 → loan 10M VND = 10000 "USD-equiv" → đúng phân phối training → PD có nghĩa.
 *
 * Override bằng env AISCORE_VND_PER_USD nếu muốn calibrate khác.
 * Đặt AISCORE_USE_REAL_EXCHANGE_RATE=1 mới gọi API tỷ giá thật (không khuyến nghị).
 */
const DEFAULT_VND_SCALE = 1000;

export async function resolveAiscoreVndPerUsd(
  aiscoreConfig: AiscoreConfig,
  logger: Logger,
  context: string,
): Promise<{ rate: number; source: string }> {
  // Priority 1: explicit env override (single source of truth khi user muốn calibrate)
  const envRate = Number(aiscoreConfig?.vndPerUsd);
  if (Number.isFinite(envRate) && envRate > 0) {
    return { rate: envRate, source: 'env:AISCORE_VND_PER_USD' };
  }

  // Priority 2: real exchange rate (CHỈ khi user explicit opt-in — dễ gây PD=0%)
  const useRealRate = ['1', 'true', 'yes'].includes(
    String(process.env.AISCORE_USE_REAL_EXCHANGE_RATE || '0').toLowerCase(),
  );
  const serviceUrl = String(aiscoreConfig?.serviceUrl || '').replace(/\/+$/, '');
  if (useRealRate && serviceUrl) {
    try {
      const { default: axios } = await import('axios');
      const timeout = Number(aiscoreConfig?.timeout) || 15000;
      const response = await axios.get(`${serviceUrl}/api/exchange-rate`, { timeout });
      const rate = Number(response.data?.usd_to_vnd ?? response.data?.rate);
      if (Number.isFinite(rate) && rate > 0) {
        logger.warn(
          `[${context}] Using REAL USD/VND rate ${rate} — cảnh báo: gây PD=0% vì input ngoài phân phối training.`,
        );
        return { rate, source: response.data?.source || 'aiscore-api' };
      }
    } catch (err: any) {
      logger.warn(`[${context}] Cannot fetch real exchange rate: ${err?.message || err}`);
    }
  }

  // Priority 3: default scale = 1000 (calibration cho phân phối training của model)
  return { rate: DEFAULT_VND_SCALE, source: 'default:vnd_scale_1000' };
}
