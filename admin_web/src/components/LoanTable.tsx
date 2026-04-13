/**
 * LoanTable - Bảng khoản vay dùng chung
 * Columns + filter chi tiết nhất, chỉ khác giai đoạn lọc ban đầu và tùy biến theo page
 */
import type { ReactNode } from 'react';
import { useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ProTable } from '@ant-design/pro-components';
import type { ActionType, ProTableProps } from '@ant-design/pro-components';
import type { ProColumns } from '@ant-design/pro-components';
import { Card, Space, Empty, theme } from 'antd';
import { FilterOutlined } from '@ant-design/icons';
import { buildLoanColumns, type LoanTableRow, type TabKey, TAB_LABELS } from '../config/loanTableConfig';
import { PRO_TABLE_DEFAULTS } from '../utils/proTableConfig';

export type LoanTableVariant = 'management' | 'approval' | 'customer';

export type LoanTableProps = {
    variant: LoanTableVariant;
    /** Request data */
    request: ProTableProps<LoanTableRow, any>['request'];
    /** Mở drawer chi tiết */
    onViewDetails: (loanId: number, userId?: string) => void;
    /** Cột hành động tùy biến (Duyệt, Giải ngân) */
    actionColumn?: ProColumns<LoanTableRow>['render'];
    /** Bật search inline (approval) */
    enableSearch?: boolean;
    /** Tab hiện tại (management) - để empty text */
    activeTab?: TabKey;
    /** Nội dung filter panel (management) - nhận actionRef để reload */
    filterContent?: (actionRef: React.RefObject<ActionType | undefined>) => ReactNode;
    /** Hiển thị panel filter */
    showFilterPanel?: boolean;
    /** Toolbar buttons */
    toolBarRender?: ProTableProps<LoanTableRow, any>['toolBarRender'];
    /** Header title */
    headerTitle?: React.ReactNode;
    /** Empty text */
    emptyText?: React.ReactNode;
    /** Pagination */
    pagination?: ProTableProps<LoanTableRow, any>['pagination'];
    /** Row key */
    rowKey?: string | ((r: LoanTableRow) => string);
    /** Post process data */
    postData?: (data: LoanTableRow[]) => LoanTableRow[];
    /** Persistence key cho columns */
    columnsStateKey?: string;
    /** Ref để parent gọi reloadAndRest (cho tab change, filter) */
    actionRef?: React.RefObject<ActionType | undefined>;
    /** Custom row style callback */
    onRow?: (record: LoanTableRow) => React.HTMLAttributes<HTMLTableRowElement>;
};

export default function LoanTable({
    variant,
    request,
    onViewDetails,
    actionColumn,
    enableSearch = false,
    activeTab = 'all',
    filterContent,
    showFilterPanel = false,
    toolBarRender,
    headerTitle = 'Danh sách khoản vay',
    emptyText,
    pagination,
    rowKey,
    postData,
    columnsStateKey = 'loan-table',
    actionRef: actionRefProp,
    onRow,
}: LoanTableProps) {
    const { token } = theme.useToken();
    const navigate = useNavigate();
    const internalRef = useRef<ActionType>();
    const actionRef = actionRefProp ?? internalRef;

    const handleNavigateToCustomer = (userId: string, loanId?: number) => {
        navigate(loanId ? `/customers/${userId}?viewLoan=${loanId}` : `/customers/${userId}`);
    };

    const columns = buildLoanColumns({
        variant,
        themeToken: token,
        onViewDetails,
        onNavigateToCustomer: variant !== 'customer' ? handleNavigateToCustomer : undefined,
        actionColumn,
        enableSearch,
    });

    const defaultEmpty = variant === 'management'
        ? <Empty description={`Chưa có khoản vay nào trong tab "${TAB_LABELS[activeTab]}"`} image={Empty.PRESENTED_IMAGE_SIMPLE} />
        : <Empty description="Chưa có khoản vay" image={Empty.PRESENTED_IMAGE_SIMPLE} />;

    return (
        <>
            {showFilterPanel && filterContent && (
                <Card variant="borderless" style={{ marginBottom: 16 }} title={<Space><FilterOutlined /> Bộ lọc nâng cao</Space>}>
                    {filterContent(actionRef)}
                </Card>
            )}

            <ProTable<LoanTableRow>
                {...PRO_TABLE_DEFAULTS}
                cardProps={PRO_TABLE_DEFAULTS.cardProps}
                actionRef={actionRef}
                rowKey={rowKey ?? ((r) => String(r.fineractLoanId ?? r._id ?? ''))}
                columns={columns}
                request={request}
                postData={postData}
                search={enableSearch ? { labelWidth: 'auto', defaultCollapsed: false } : false}
                headerTitle={headerTitle}
                toolBarRender={toolBarRender}
                pagination={pagination ?? { pageSize: 20, showSizeChanger: true, showTotal: (t) => `Tổng ${t} khoản` }}
                locale={{ emptyText: emptyText ?? defaultEmpty }}
                scroll={{ x: 'max-content' }}
                options={{ reload: true, density: true, fullScreen: true, setting: true }}
                columnsState={{ persistenceKey: columnsStateKey, persistenceType: 'localStorage' }}
                onRow={onRow}
            />
        </>
    );
}
