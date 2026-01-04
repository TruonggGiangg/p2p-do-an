import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';

/**
 * Digital Footprint Data (from client device)
 */
export interface DigitalFootprintData {
    battery_level: number;          // 0-100
    submission_hour: number;        // 0-23
    connection_type: 'wifi' | '4g' | 'unknown';
    location_match: 'true' | 'false';
    device_score?: number;          // 0-100 (optional, calculated by client)
}

/**
 * Credit Assessment Result (from Fineract)
 */
export interface CreditAssessment {
    score: number;              // Credit score (300-850)
    grade: string;              // A+, A, B, C, D, F
    riskLevel: 'low' | 'medium' | 'high' | 'very_high';
    isApproved: boolean;
    source: 'fineract_scorecard';
    predictedRisk: string;
    accuracy?: number;
    recommendations: string[];
    rejectionReasons?: string[];
}

/**
 * Credit Scoring Service
 * 
 * Gọi API Fineract Credit Scorecard để chấm điểm tín dụng.
 * Không tự tính local - tất cả logic nằm trên Fineract.
 * 
 * API: POST /fineract-provider/api/v1/creditScorecard/loans/{loanId}/assess
 * Ref: fineract-dev/docs/MOBILE_API_GUIDE.md
 */
@Injectable()
export class CreditScoringService {
    private readonly logger = new Logger(CreditScoringService.name);

    private readonly baseUrl: string;
    private readonly tenantId: string;
    private readonly keycloakUrl: string;
    private readonly username: string;
    private readonly password: string;
    private readonly oauthClientId: string;
    private readonly oauthClientSecret: string;

    // Scoring thresholds (for approval decision)
    private readonly MIN_APPROVAL_SCORE = 450;

    // Token cache
    private accessToken: string | null = null;
    private tokenExpiry: Date | null = null;

    constructor(
        private readonly httpService: HttpService,
        private readonly configService: ConfigService,
    ) {
        this.baseUrl = this.configService.get<string>('FINERACT_BASE_URL') || 'http://localhost:8080';
        this.tenantId = this.configService.get<string>('FINERACT_TENANT_ID') || 'default';
        this.keycloakUrl = this.configService.get<string>('KEYCLOAK_BASE_URL') || 'http://localhost:9000';
        this.username = this.configService.get<string>('FINERACT_USERNAME') || 'mifos';
        this.password = this.configService.get<string>('FINERACT_PASSWORD') || 'password';
        this.oauthClientId = this.configService.get<string>('FINERACT_OAUTH_CLIENT_ID') || 'community-app';
        this.oauthClientSecret = this.configService.get<string>('FINERACT_OAUTH_CLIENT_SECRET') || '123';
    }

    /**
     * Get OAuth2 token from Keycloak
     */
    private async getAccessToken(): Promise<string> {
        if (this.accessToken && this.tokenExpiry && new Date() < this.tokenExpiry) {
            return this.accessToken;
        }

        try {
            const tokenUrl = `${this.keycloakUrl}/realms/fineract/protocol/openid-connect/token`;
            const params = new URLSearchParams();
            params.append('grant_type', 'password');
            params.append('client_id', this.oauthClientId);
            params.append('client_secret', this.oauthClientSecret);
            params.append('username', this.username);
            params.append('password', this.password);

            const response = await firstValueFrom(
                this.httpService.post(tokenUrl, params.toString(), {
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    timeout: 15000,
                }),
            );

            this.accessToken = response.data.access_token;
            this.tokenExpiry = new Date(Date.now() + (response.data.expires_in - 60) * 1000);
            return this.accessToken as string;
        } catch (error: any) {
            this.logger.error(`Failed to get OAuth2 token: ${error.message}`);
            throw error;
        }
    }

    /**
     * Get headers for Fineract API calls
     */
    private async getHeaders(): Promise<Record<string, string>> {
        const token = await this.getAccessToken();
        return {
            'Authorization': `Bearer ${token}`,
            'Fineract-Platform-TenantId': this.tenantId,
            'Content-Type': 'application/json',
        };
    }

    /**
     * Assess creditworthiness by calling Fineract Credit Scorecard API
     * 
     * @param userId - User ID (for logging)
     * @param requestedAmount - Loan amount (for logging)
     * @param footprint - Digital footprint data from client device
     * @param fineractLoanId - Optional Fineract loan ID (if loan already exists)
     */
    async assessCreditworthiness(
        userId: string,
        requestedAmount: number,
        footprint?: DigitalFootprintData,
        fineractLoanId?: number,
    ): Promise<CreditAssessment> {
        this.logger.log(`[CreditScoring] Assessing user ${userId}, amount: ${requestedAmount}`);

        // If no footprint, use defaults
        const data: DigitalFootprintData = footprint || {
            battery_level: 50,
            submission_hour: new Date().getHours(),
            connection_type: 'unknown',
            location_match: 'false',
        };

        this.logger.log(`[CreditScoring] Digital Footprint: ${JSON.stringify(data)}`);

        // If no Fineract loan ID, use fallback scoring
        if (!fineractLoanId) {
            this.logger.warn('[CreditScoring] No Fineract loan ID - using fallback scoring');
            return this.fallbackScoring(data);
        }

        try {
            // Call Fineract Credit Scorecard API
            const headers = await this.getHeaders();
            const url = `${this.baseUrl}/fineract-provider/api/v1/creditScorecard/loans/${fineractLoanId}/assess?scoringMethod=digital`;

            this.logger.log(`[CreditScoring] Calling Fineract: ${url}`);

            const response = await firstValueFrom(
                this.httpService.post(url, data, { headers, timeout: 30000 }),
            );

            const result = response.data;
            this.logger.log(`[CreditScoring] Fineract response: ${JSON.stringify(result)}`);

            // Extract score from response
            const scorecard = result.mlScorecard || result;
            const creditScore = scorecard.creditScore || 500;
            const predictedRisk = scorecard.predictedRisk || 'medium';

            // Map to internal format
            const assessment = this.mapFineractResponse(creditScore, predictedRisk, scorecard.accuracy);

            this.logger.log(`[CreditScoring] Result: Score=${assessment.score}, Grade=${assessment.grade}, Approved=${assessment.isApproved}`);

            return assessment;

        } catch (error: any) {
            this.logger.error(`[CreditScoring] Fineract API error: ${error.message}`);

            // Fallback to local calculation if Fineract fails
            this.logger.warn('[CreditScoring] Using fallback scoring due to API error');
            return this.fallbackScoring(data);
        }
    }

    /**
     * Fallback scoring when Fineract is unavailable
     * Simple calculation based on digital footprint
     */
    private fallbackScoring(data: DigitalFootprintData): CreditAssessment {
        this.logger.log('[CreditScoring] Using fallback local scoring');

        let rawScore = 50; // Base score

        // Battery level (max +20)
        if (data.battery_level >= 80) rawScore += 20;
        else if (data.battery_level >= 50) rawScore += 15;
        else if (data.battery_level >= 20) rawScore += 10;

        // Submission hour - business hours (max +25)
        const hour = data.submission_hour;
        if (hour >= 8 && hour <= 18) rawScore += 25;
        else if (hour >= 6 && hour <= 22) rawScore += 15;

        // Connection type (max +20)
        if (data.connection_type === 'wifi') rawScore += 20;
        else if (data.connection_type === '4g') rawScore += 15;

        // Location (max +35)
        if (data.location_match === 'true') rawScore += 35;

        // Convert to FICO scale (300-850)
        const ficoScore = Math.round(300 + (rawScore / 100) * 550);
        const clampedScore = Math.max(300, Math.min(850, ficoScore));

        return this.mapFineractResponse(clampedScore, this.getRiskLevel(clampedScore));
    }

    /**
     * Map Fineract response to internal CreditAssessment format
     */
    private mapFineractResponse(
        creditScore: number,
        predictedRisk: string,
        accuracy?: number,
    ): CreditAssessment {
        const grade = this.getGrade(creditScore);
        const riskLevel = this.normalizeRiskLevel(predictedRisk);
        const isApproved = creditScore >= this.MIN_APPROVAL_SCORE;

        const recommendations = this.generateRecommendations(creditScore, isApproved);
        const rejectionReasons = isApproved ? undefined : this.getRejectionReasons(creditScore);

        return {
            score: creditScore,
            grade,
            riskLevel,
            isApproved,
            source: 'fineract_scorecard',
            predictedRisk,
            accuracy,
            recommendations,
            rejectionReasons,
        };
    }

    /**
     * Get grade from score
     */
    private getGrade(score: number): string {
        if (score >= 750) return 'A+';
        if (score >= 700) return 'A';
        if (score >= 650) return 'B+';
        if (score >= 600) return 'B';
        if (score >= 550) return 'C+';
        if (score >= 500) return 'C';
        if (score >= 450) return 'D';
        return 'F';
    }

    /**
     * Get risk level from score
     */
    private getRiskLevel(score: number): 'low' | 'medium' | 'high' | 'very_high' {
        if (score >= 700) return 'low';
        if (score >= 550) return 'medium';
        if (score >= 450) return 'high';
        return 'very_high';
    }

    /**
     * Normalize risk level from Fineract
     */
    private normalizeRiskLevel(risk: string): 'low' | 'medium' | 'high' | 'very_high' {
        const normalized = risk.toLowerCase().replace('_', '').replace('-', '');
        if (normalized.includes('low')) return 'low';
        if (normalized.includes('high') && normalized.includes('very')) return 'very_high';
        if (normalized.includes('high')) return 'high';
        return 'medium';
    }

    /**
     * Generate recommendations
     */
    private generateRecommendations(score: number, isApproved: boolean): string[] {
        if (score >= 750) {
            return ['✅ Tín dụng xuất sắc! Đủ điều kiện vay với lãi suất ưu đãi.'];
        }

        const recommendations: string[] = [];

        if (!isApproved) {
            recommendations.push('⚠️ Cần cải thiện điểm tín dụng trước khi vay.');
        }

        if (score < 600) {
            recommendations.push('📍 Cấp quyền vị trí để tăng độ tin cậy');
            recommendations.push('⏰ Gửi yêu cầu trong giờ làm việc (8h-18h)');
        }

        return recommendations.length > 0 ? recommendations : ['Tiếp tục sử dụng dịch vụ để cải thiện điểm.'];
    }

    /**
     * Get rejection reasons
     */
    private getRejectionReasons(score: number): string[] {
        return [
            `Điểm tín dụng (${score}) thấp hơn ngưỡng tối thiểu (${this.MIN_APPROVAL_SCORE})`,
            'Vui lòng cải thiện các yếu tố Digital Footprint và thử lại.',
        ];
    }

    /**
     * Get scorecard history from Fineract
     * GET /creditScorecard/loans/{loanId}/scorecard
     * 
     * @param fineractLoanId - Fineract loan ID
     * @returns Array of scorecards, newest first
     */
    async getScorecardHistory(fineractLoanId: number): Promise<any[]> {
        this.logger.log(`[CreditScoring] Getting scorecard history for loan ${fineractLoanId}`);

        try {
            const headers = await this.getHeaders();
            const url = `${this.baseUrl}/fineract-provider/api/v1/creditScorecard/loans/${fineractLoanId}/scorecard`;

            const response = await firstValueFrom(
                this.httpService.get(url, { headers, timeout: 15000 }),
            );

            // Response is array of scorecards
            let scorecards = Array.isArray(response.data) ? response.data : [];

            // Parse createdOn date arrays to Date objects
            scorecards = scorecards.map((s: any) => {
                let date = s.createdOn || s.createdDate;
                if (Array.isArray(date)) {
                    // Format: [year, month, day, hour, minute, second]
                    date = new Date(date[0], date[1] - 1, date[2],
                        date[3] || 0, date[4] || 0, date[5] || 0);
                }
                return { ...s, createdOn: date };
            });

            // Sort by date descending (newest first)
            scorecards.sort((a: any, b: any) => {
                return new Date(b.createdOn).getTime() - new Date(a.createdOn).getTime();
            });

            this.logger.log(`[CreditScoring] Found ${scorecards.length} scorecard(s)`);
            return scorecards;

        } catch (error: any) {
            if (error.response?.status === 404) {
                this.logger.log('[CreditScoring] No scorecard found (404)');
                return [];
            }
            this.logger.error(`[CreditScoring] Error fetching history: ${error.message}`);
            throw error;
        }
    }
}

