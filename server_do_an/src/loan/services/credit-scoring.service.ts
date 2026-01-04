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
    grade: string;              // A, B, C
    riskLevel: 'low' | 'medium' | 'high';
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
     * ONLY uses Fineract API - no local fallback.
     * Throws error if Fineract loan ID is missing or API call fails.
     * 
     * @param userId - User ID (for logging)
     * @param requestedAmount - Loan amount (for logging)
     * @param footprint - Digital footprint data from client device
     * @param fineractLoanId - Required Fineract loan ID
     */
    async assessCreditworthiness(
        userId: string,
        requestedAmount: number,
        footprint: DigitalFootprintData,
        fineractLoanId: number,
    ): Promise<CreditAssessment> {
        this.logger.log(`[CreditScoring] Assessing user ${userId}, amount: ${requestedAmount}, loanId: ${fineractLoanId}`);

        if (!fineractLoanId) {
            throw new Error('Fineract Loan ID is required for credit assessment');
        }

        const data: DigitalFootprintData = {
            battery_level: footprint.battery_level ?? 50,
            submission_hour: footprint.submission_hour ?? new Date().getHours(),
            connection_type: footprint.connection_type ?? 'unknown',
            location_match: footprint.location_match ?? 'false',
            device_score: footprint.device_score,
        };

        this.logger.log(`[CreditScoring] Digital Footprint: ${JSON.stringify(data)}`);

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
        let creditScore = scorecard.creditScore;
        let predictedRisk = scorecard.predictedRisk || 'medium';

        // Normalize risk label
        if (predictedRisk === 'low_risk') predictedRisk = 'low';
        if (predictedRisk === 'high_risk') predictedRisk = 'high';

        // Score mapping if Fineract returns default 500
        const SCORE_MAP: Record<string, number> = { low: 750, medium: 600, high: 400 };
        if (!creditScore || creditScore === 500) {
            creditScore = SCORE_MAP[predictedRisk] || 600;
            this.logger.log(`[CreditScoring] Score mapped: Risk "${predictedRisk}" → Score ${creditScore}`);
        }

        // Map to internal format
        const assessment = this.mapFineractResponse(creditScore, predictedRisk, scorecard.accuracy);

        this.logger.log(`[CreditScoring] Result: Score=${assessment.score}, Grade=${assessment.grade}, Approved=${assessment.isApproved}`);

        return assessment;
    }



    /**
     * Map Fineract response to internal CreditAssessment format
     */
    private mapFineractResponse(
        creditScore: number,
        predictedRisk: string,
        accuracy?: number,
    ): CreditAssessment {
        const riskLevel = this.normalizeRiskLevel(predictedRisk || this.getRiskLevel(creditScore));
        const grade = this.getGrade(creditScore);
        const isApproved = riskLevel !== 'high';

        const recommendations = this.generateRecommendations(creditScore, riskLevel);
        const rejectionReasons = isApproved ? undefined : this.getRejectionReasons(creditScore);

        return {
            score: creditScore,
            grade,
            riskLevel,
            isApproved,
            source: 'fineract_scorecard',
            predictedRisk: riskLevel,
            accuracy,
            recommendations,
            rejectionReasons,
        };
    }

    /**
     * Get grade from score
     */
    private getGrade(score: number): string {
        if (score >= 700) return 'A';
        if (score >= 500) return 'B';
        return 'C';
    }

    /**
     * Get risk level from score
     */
    private getRiskLevel(score: number): 'low' | 'medium' | 'high' {
        if (score >= 700) return 'low';
        if (score >= 500) return 'medium';
        return 'high';
    }

    /**
     * Normalize risk level from Fineract
     */
    private normalizeRiskLevel(risk: string): 'low' | 'medium' | 'high' {
        const normalized = risk.toLowerCase();
        if (normalized.includes('low')) return 'low';
        if (normalized.includes('high')) return 'high';
        return 'medium';
    }

    /**
     * Generate recommendations
     */
    private generateRecommendations(score: number, riskLevel: string): string[] {
        if (riskLevel === 'low') {
            return ['✅ Tín dụng tốt. Đủ điều kiện vay.'];
        }
        if (riskLevel === 'medium') {
            return ['⚠️ Điểm trung bình. Có thể cần điều chỉnh hạn mức.'];
        }
        return ['❌ Rủi ro cao. Cần cải thiện hồ sơ thiết bị (Vị trí, Pin, Giờ gửi).'];
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

    /**
     * Pre-Loan Credit Assessment (before loan creation)
     * 
     * Chấm điểm tín dụng TRƯỚC khi tạo khoản vay bằng Fineract API.
     * Gọi endpoint: POST /creditScorecard/predict
     * 
     * Nếu HIGH_RISK hoặc VERY_HIGH_RISK → Từ chối ngay
     * Nếu LOW hoặc MEDIUM → Cho phép tạo khoản vay
     * 
     * @param footprint - Digital footprint data from client
     * @param loanAmount - Requested loan amount
     * @param periodMonths - Loan term in months
     * @param userProfile - Optional user profile data (income, dti, etc.)
     * @returns CreditAssessment with approval decision
     */
    async assessPreLoan(
        footprint: DigitalFootprintData,
        loanAmount: number,
        periodMonths: number,
        userProfile?: { income?: number; dti?: number; age?: number; occupation?: string },
    ): Promise<CreditAssessment & { canProceed: boolean; rejectionMessage?: string }> {
        this.logger.log(`[PreLoanAssess] Amount: ${loanAmount}, Term: ${periodMonths} months`);
        this.logger.log(`[PreLoanAssess] Digital Footprint: ${JSON.stringify(footprint)}`);

        // Call Fineract Credit Scorecard /predict API (Pre-loan scoring)
        const headers = await this.getHeaders();
        const url = `${this.baseUrl}/fineract-provider/api/v1/creditScorecard/predict`;

        // Build prediction request body (matching reference p2p project)
        const predictionBody = {
            // Required Vietnam model fields
            loan_amnt: loanAmount,
            annual_inc: userProfile?.income || 120000000, // Default 10M/month
            dti: userProfile?.dti || 30,
            purpose: 'other',
            // Recommended fields
            term: `${periodMonths} months`,
            emp_length: '1 year',
            home_ownership: 'RENT',
            delinq_2yrs: 0,
            verification_status: 'Not Verified',
            // Optional V3 fields
            age: userProfile?.age || 30,
            gender: 'male',
            occupation: userProfile?.occupation || 'Nhân viên văn phòng',
            monthly_ir: (userProfile?.income || 120000000) / 12,
            balance: 50000000,
            // Digital footprint data
            battery_level: footprint.battery_level ?? 50,
            submission_hour: footprint.submission_hour ?? new Date().getHours(),
            connection_type: footprint.connection_type ?? 'unknown',
            location_match: footprint.location_match ?? 'false',
            device_score: footprint.device_score ?? 50,
        };

        this.logger.log(`[PreLoanAssess] Calling Fineract: ${url}`);
        this.logger.log(`[PreLoanAssess] Request Body: ${JSON.stringify(predictionBody)}`);

        const response = await firstValueFrom(
            this.httpService.post(url, predictionBody, { headers, timeout: 30000 }),
        );

        const result = response.data;
        this.logger.log(`[PreLoanAssess] Fineract response: ${JSON.stringify(result)}`);

        // Parse response (format from Fineract /predict)
        let predictedRisk = result.predictedRisk || result.label || result.mlScorecard?.predictedRisk || 'medium';
        let creditScore = result.creditScore || result.score || result.mlScorecard?.creditScore;
        const accuracy = result.accuracy || result.probability || result.mlScorecard?.accuracy;

        // Normalize risk label
        if (predictedRisk === 'low_risk') predictedRisk = 'low';
        if (predictedRisk === 'high_risk') predictedRisk = 'high';

        // Score mapping if Fineract returns default 500
        const SCORE_MAP: Record<string, number> = { low: 750, medium: 600, high: 400 };
        if (!creditScore || creditScore === 500) {
            creditScore = SCORE_MAP[predictedRisk] || 600;
            this.logger.log(`[PreLoanAssess] Score mapped: Risk "${predictedRisk}" → Score ${creditScore}`);
        }

        // Build assessment result
        const riskLevel = this.normalizeRiskLevel(predictedRisk);
        const grade = this.getGrade(creditScore);
        const isApproved = riskLevel !== 'high';
        const canProceed = isApproved;

        let rejectionMessage: string | undefined;
        if (!canProceed) {
            rejectionMessage = 'Hồ sơ của bạn được đánh giá là CÓ RỦI RO CAO. ' +
                'Hiện tại chúng tôi chưa thể phê duyệt khoản vay dựa trên dữ liệu thiết bị này.';
        }

        this.logger.log(`[PreLoanAssess] Score: ${creditScore}, Risk: ${riskLevel}, CanProceed: ${canProceed}`);

        return {
            score: creditScore,
            grade,
            riskLevel,
            isApproved,
            source: 'fineract_scorecard',
            predictedRisk: riskLevel,
            accuracy,
            recommendations: this.generateRecommendations(creditScore, riskLevel),
            rejectionReasons: isApproved ? undefined : this.getRejectionReasons(creditScore),
            canProceed,
            rejectionMessage,
        };
    }
}

