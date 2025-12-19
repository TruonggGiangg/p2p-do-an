/**
 * API Types - Generic API response types
 */

// Generic API Response
export interface ApiResponse<T = any> {
    statusCode?: number;
    message?: string;
    data?: T;
    timestamp?: string;
}

// API Error Response
export interface ApiError {
    statusCode: number;
    message: string;
    error?: string;
    timestamp?: string;
}

// Pagination types
export interface PaginationParams {
    page?: number;
    limit?: number;
    sort?: string;
}

export interface PaginatedResponse<T> {
    data: T[];
    meta: {
        currentPage: number;
        pageSize: number;
        total: number;
        pages: number;
    };
}
