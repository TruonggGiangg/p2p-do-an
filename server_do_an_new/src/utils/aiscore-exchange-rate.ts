import { BadRequestException, Logger } from '@nestjs/common';

type AiscoreConfig = {
  serviceUrl?: string;
  timeout?: number;
  vndPerUsd?: number;
};

export async function resolveAiscoreVndPerUsd(
  aiscoreConfig: AiscoreConfig,
  logger: Logger,
  context: string,
): Promise<{ rate: number; source: string }> {
  const serviceUrl = String(aiscoreConfig?.serviceUrl || '').replace(/\/+$/, '');
  const timeout = Number(aiscoreConfig?.timeout) || 15000;

  if (serviceUrl) {
    try {
      const { default: axios } = await import('axios');
      const response = await axios.get(`${serviceUrl}/api/exchange-rate`, { timeout });
      const rate = Number(response.data?.usd_to_vnd ?? response.data?.rate);
      if (Number.isFinite(rate) && rate > 0) {
        return { rate, source: response.data?.source || 'aiscore-api' };
      }
      logger.warn(`[${context}] AIScore exchange-rate response invalid: ${JSON.stringify(response.data)}`);
    } catch (err: any) {
      logger.warn(`[${context}] Cannot fetch AIScore exchange rate: ${err?.message || err}`);
    }
  }

  const envRate = Number(aiscoreConfig?.vndPerUsd);
  if (Number.isFinite(envRate) && envRate > 0) {
    logger.warn(`[${context}] Using explicit AISCORE_VND_PER_USD override: ${envRate}`);
    return { rate: envRate, source: 'env:AISCORE_VND_PER_USD' };
  }

  throw new BadRequestException(
    'Khong lay duoc ty gia VND/USD tu AIScore API. Bat AIScore service hoac cau hinh AISCORE_VND_PER_USD.',
  );
}
