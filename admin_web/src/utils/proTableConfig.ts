/**
 * Cấu hình mặc định cho ProTable (Ant Design Pro) - dùng nhất quán trên toàn bộ admin web
 *
 * ProTable API:
 * - columns: ProColumns[] - định nghĩa cột, hỗ trợ search, sorter, filters, fixed, valueType
 * - request: (params) => Promise<{data, success, total}> - load dữ liệu (có pagination)
 * - dataSource: T[] - dữ liệu tĩnh (không dùng request)
 * - search: SearchConfig | false - form tìm kiếm (tự sinh từ columns có search)
 * - scroll: { x?: number, y?: number } - bắt buộc khi dùng fixed columns
 * - showSorterTooltip: false - tránh tooltip sorter che header
 * - pagination: config pagination
 * - options: { reload, density, fullScreen, setting, search }
 * - columnsState: { persistenceKey, persistenceType } - lưu trạng thái cột
 * - cardProps: style cho Card wrapper
 * - headerTitle, toolBarRender
 *
 * Dùng Pick thay vì Partial để tránh lỗi type khi spread vào ProTable<DataType> generic.
 */
import type { ProTableProps } from '@ant-design/pro-components';

type ProTableDefaults = Pick<
  ProTableProps<any, any>,
  'showSorterTooltip' | 'cardProps' | 'tableAlertRender' | 'tableAlertOptionRender' | 'size'
>;

export const PRO_TABLE_DEFAULTS: ProTableDefaults = {
  showSorterTooltip: false,
  size: 'middle',
  cardProps: {
    className: 'premium-pro-table-card',
    style: {
      borderRadius: 16,
      border: '1px solid var(--border-color)',
      boxShadow: 'var(--shadow-md)',
      overflow: 'hidden',
      backgroundColor: 'var(--surface-color)',
    },
    bodyStyle: {
      padding: 16,
    },
  },
  tableAlertRender: false,
  tableAlertOptionRender: false,
};
