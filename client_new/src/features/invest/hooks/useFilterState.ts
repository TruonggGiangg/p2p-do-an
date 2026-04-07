/**
 * useFilterState — Custom hook quản lý filter/sort/phân trang cho AvailableLoans
 */
import { useState, useCallback, useMemo } from 'react';

export interface FilterState {
  search: string;
  sortBy: 'createdAt' | 'capital' | 'monthlyRatePercent' | 'periodMonth' | 'entirelyPay';
  sortOrder: 'asc' | 'desc';
  minRate?: number;
  maxRate?: number;
  minPeriod?: number;
  maxPeriod?: number;
  minCapital?: number;
  maxCapital?: number;
  riskLevel?: string; // 'LOW' | 'MEDIUM' | 'HIGH' | 'VERY_HIGH' | undefined
}

export interface FilterQueryParams {
  page: number;
  pageSize: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  minRate?: number;
  maxRate?: number;
  minPeriod?: number;
  maxPeriod?: number;
  minCapital?: number;
  maxCapital?: number;
  search?: string;
  riskLevel?: string;
}

const DEFAULT_FILTER: FilterState = {
  search: '',
  sortBy: 'createdAt',
  sortOrder: 'desc',
  minRate: undefined,
  maxRate: undefined,
  minPeriod: undefined,
  maxPeriod: undefined,
  minCapital: undefined,
  maxCapital: undefined,
  riskLevel: undefined,
};

export function useFilterState() {
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTER);
  const [page, setPage] = useState(1);
  const pageSize = 50;

  const setFilter = useCallback(<K extends keyof FilterState>(key: K, value: FilterState[K]) => {
    setFilters(prev => ({ ...prev, [key]: value }));
    setPage(1); // Reset to page 1 when filter changes
  }, []);

  const setMultipleFilters = useCallback((updates: Partial<FilterState>) => {
    setFilters(prev => ({ ...prev, ...updates }));
    setPage(1);
  }, []);

  const resetFilters = useCallback(() => {
    setFilters(DEFAULT_FILTER);
    setPage(1);
  }, []);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.search.trim()) count++;
    if (filters.minRate !== undefined) count++;
    if (filters.maxRate !== undefined) count++;
    if (filters.minPeriod !== undefined) count++;
    if (filters.maxPeriod !== undefined) count++;
    if (filters.minCapital !== undefined) count++;
    if (filters.maxCapital !== undefined) count++;
    if (filters.riskLevel) count++;
    return count;
  }, [filters]);

  const buildQueryParams = useCallback((): FilterQueryParams => {
    const params: FilterQueryParams = {
      page,
      pageSize,
      sortBy: filters.sortBy,
      sortOrder: filters.sortOrder,
    };
    if (filters.search.trim()) params.search = filters.search.trim();
    if (filters.minRate !== undefined) params.minRate = filters.minRate;
    if (filters.maxRate !== undefined) params.maxRate = filters.maxRate;
    if (filters.minPeriod !== undefined) params.minPeriod = filters.minPeriod;
    if (filters.maxPeriod !== undefined) params.maxPeriod = filters.maxPeriod;
    if (filters.minCapital !== undefined) params.minCapital = filters.minCapital;
    if (filters.maxCapital !== undefined) params.maxCapital = filters.maxCapital;
    if (filters.riskLevel) params.riskLevel = filters.riskLevel;
    return params;
  }, [filters, page, pageSize]);

  return {
    filters,
    page,
    pageSize,
    setFilter,
    setMultipleFilters,
    resetFilters,
    activeFilterCount,
    buildQueryParams,
    setPage,
  };
}
