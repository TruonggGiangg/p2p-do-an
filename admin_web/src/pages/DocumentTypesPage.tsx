import { useCallback, useRef, useState } from 'react';
import {
  ProTable,
  DrawerForm,
  ProFormText,
  ProFormCheckbox,
  ProFormTextArea,
  ProFormSelect,
} from '@ant-design/pro-components';
import type { ActionType, ProColumns } from '@ant-design/pro-components';
import { Button, Popconfirm, message, Space, Typography, Tag, Divider, theme } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, FileImageOutlined, FilePdfOutlined, FileOutlined, FileTextOutlined, CloseOutlined } from '@ant-design/icons';
import { adminApi, type DocumentTypeDto, type FileFormat } from '../api/admin';
import { PRO_TABLE_DEFAULTS } from '../utils/proTableConfig';

const { Text } = Typography;

const FILE_FORMAT_LABELS: Record<FileFormat, string> = {
  image: 'Hình ảnh',
  pdf: 'PDF',
  any: 'Cả hai',
};

const FILE_FORMAT_COLORS: Record<FileFormat, string> = {
  image: 'green',
  pdf: 'red',
  any: 'blue',
};

const FILE_FORMAT_ICONS: Record<FileFormat, React.ReactNode> = {
  image: <FileImageOutlined />,
  pdf: <FilePdfOutlined />,
  any: <FileOutlined />,
};

export default function DocumentTypesPage() {
  const { token } = theme.useToken();
  const actionRef = useRef<ActionType>();
  const [modalVisible, setModalVisible] = useState(false);
  const [currentRow, setCurrentRow] = useState<DocumentTypeDto | null>(null);

  const fetchData = useCallback(async () => {
    actionRef.current?.reload();
  }, []);

  const handleSave = async (values: any) => {
    try {
      if (currentRow) {
        await adminApi.updateDocumentType(currentRow._id, values);
        message.success('Cập nhật thành công');
      } else {
        await adminApi.createDocumentType(values);
        message.success('Thêm mới thành công');
      }
      setModalVisible(false);
      setCurrentRow(null);
      await fetchData();
    } catch (e: any) {
      message.error(e.response?.data?.message || e.message || 'Lưu thất bại');
    }
  };

  const handleRemove = async (id: string) => {
    try {
      await adminApi.deleteDocumentType(id);
      message.success('Đã xóa loại tài liệu');
      await fetchData();
    } catch (e: any) {
      message.error(e.response?.data?.message || e.message || 'Xóa thất bại');
    }
  };

  const columns: ProColumns<DocumentTypeDto>[] = [
    {
      title: 'Tên loại tài liệu',
      dataIndex: 'name',
      copyable: true,
      ellipsis: true,
      search: { transform: (v) => v?.trim() || undefined },
      fieldProps: { placeholder: 'Tìm theo tên...' },
      sorter: (a, b) => (a.name || '').localeCompare(b.name || ''),
      render: (text) => <Text strong>{text}</Text>,
    },
    {
      title: 'Định dạng file',
      dataIndex: 'fileFormat',
      width: 150,
      align: 'center',
      filters: [
        { text: 'Hình ảnh', value: 'image' },
        { text: 'PDF', value: 'pdf' },
        { text: 'Cả hai', value: 'any' },
      ],
      onFilter: (value, record) => (record.fileFormat || 'any') === value,
      render: (fileFormat) => {
        const fmt = (fileFormat || 'any') as FileFormat;
        return (
          <Tag icon={FILE_FORMAT_ICONS[fmt]} color={FILE_FORMAT_COLORS[fmt]}>
            {FILE_FORMAT_LABELS[fmt]}
          </Tag>
        );
      },
    },
    {
      title: 'Bắt buộc',
      dataIndex: 'required',
      width: 120,
      align: 'center',
      filters: [
        { text: 'Bắt buộc', value: true },
        { text: 'Không bắt buộc', value: false },
      ],
      onFilter: (value, record) => record.required === value,
      render: (required) => (
        <Tag color={required ? 'red' : 'default'}>
          {required ? 'Bắt buộc' : 'Không bắt buộc'}
        </Tag>
      ),
    },
    {
      title: 'Thao tác',
      valueType: 'option',
      key: 'option',
      fixed: 'right',
      width: 200,
      align: 'right',
      search: false,
      onCell: () => ({ style: { paddingLeft: 12, paddingRight: 12, whiteSpace: 'nowrap' } }),
      render: (_, record) => (
        <Space>
          <Button
            type="text"
            icon={<EditOutlined />}
            onClick={() => {
              setCurrentRow(record);
              setModalVisible(true);
            }}
          >
            Sửa
          </Button>
          <Popconfirm
            title="Xóa loại tài liệu này?"
            description="Lưu ý: Hành động này không thể hoàn tác."
            onConfirm={() => handleRemove(record._id)}
            okText="Xóa"
            cancelText="Hủy"
            okButtonProps={{ danger: true }}
          >
            <Button type="text" danger icon={<DeleteOutlined />}>
              Xóa
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const initialValues = currentRow
    ? {
      ...currentRow,
    }
    : { required: false, fileFormat: 'any' };

  return (
    <>
      <DrawerForm
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {currentRow ? <EditOutlined style={{ color: token.colorPrimary }} /> : <PlusOutlined style={{ color: token.colorPrimary }} />}
            <span>{currentRow ? 'Sửa loại tài liệu' : 'Thêm loại tài liệu'}</span>
          </div>
        }
        open={modalVisible}
        onOpenChange={(open) => {
          setModalVisible(open);
          if (!open) setCurrentRow(null);
        }}
        layout="vertical"
        initialValues={initialValues}
        onFinish={handleSave}
        width={Math.min(560, window.innerWidth * 0.92)}
        drawerProps={{
          destroyOnClose: true,
          extra: (
            <Button 
              onClick={() => {
                setModalVisible(false);
                setCurrentRow(null);
              }}
              icon={<CloseOutlined />}
            >
              Đóng
            </Button>
          ),
        }}
      >
        <Divider style={{ margin: '0 0 24px 0' }} />
        
        <ProFormText
          name="name"
          label={<span style={{ fontWeight: 600, fontSize: 15 }}>Tên loại tài liệu <span style={{ color: token.colorError }}>*</span></span>}
          placeholder="Ví dụ: CCCD mặt trước"
          rules={[{ required: true, message: 'Vui lòng nhập tên' }]}
          fieldProps={{ size: 'large' }}
        />

        <ProFormTextArea
          name="description"
          label={<span style={{ fontWeight: 600, fontSize: 15 }}>Mô tả</span>}
          placeholder="Mô tả ngắn gọn về loại tài liệu này (không bắt buộc)"
          fieldProps={{ 
            autoSize: { minRows: 3, maxRows: 6 },
            size: 'large',
            style: { resize: 'vertical' },
          }}
        />

        <ProFormSelect
          name="fileFormat"
          label={<span style={{ fontWeight: 600, fontSize: 15 }}>Định dạng file cho phép</span>}
          placeholder="Chọn định dạng file"
          options={[
            { label: <span><FileOutlined /> Cả hai (Ảnh & PDF)</span>, value: 'any' },
            { label: <span><FileImageOutlined /> Chỉ hình ảnh</span>, value: 'image' },
            { label: <span><FilePdfOutlined /> Chỉ PDF</span>, value: 'pdf' },
          ]}
          initialValue="any"
          fieldProps={{ size: 'large' }}
        />

        <div style={{ 
          padding: '16px', 
          background: token.colorFillAlter, 
          borderRadius: 0, 
          border: `1px solid ${token.colorBorderSecondary}`,
          marginTop: 8,
        }}>
          <ProFormCheckbox 
            name="required" 
            label={<span style={{ fontWeight: 600, fontSize: 15 }}>Đánh dấu là bắt buộc nộp</span>}
          />
          <Text type="secondary" style={{ fontSize: 13, display: 'block', marginTop: 4 }}>
            Nếu bật, khách hàng phải nộp tài liệu này khi đăng ký vay
          </Text>
        </div>
      </DrawerForm>

      <ProTable<DocumentTypeDto>
        {...PRO_TABLE_DEFAULTS}
        headerTitle={
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <FileTextOutlined style={{ fontSize: 20, color: token.colorPrimary }} />
            <span>Danh mục loại tài liệu</span>
          </div>
        }
        actionRef={actionRef}
        rowKey="_id"
        search={{
          labelWidth: 'auto',
          defaultCollapsed: false,
          collapseRender: () => undefined,
        }}
        request={async (params) => {
          try {
            const data = await adminApi.getDocumentTypes();
            let filtered = (data || []).filter(Boolean).filter((i) => i && i._id != null);
            const name = (params.name as string)?.toLowerCase?.()?.trim?.();
            if (name) filtered = filtered.filter((i) => i.name.toLowerCase().includes(name));
            if (params.required !== undefined && params.required !== '') {
              const isReq = params.required === 'true';
              filtered = filtered.filter((i) => i.required === isReq);
            }
            if (params.fileFormat) {
              filtered = filtered.filter((i) => (i.fileFormat || 'any') === params.fileFormat);
            }
            const page = params.current ?? 1;
            const size = params.pageSize ?? 10;
            const start = (page - 1) * size;
            const paged = filtered.slice(start, start + size);
            return { data: paged, success: true, total: filtered.length };
          } catch (e) {
            message.error('Không thể tải dữ liệu');
            return { data: [], success: false, total: 0 };
          }
        }}
        postData={(data: DocumentTypeDto[]) => (data || []).filter((r: DocumentTypeDto) => r && r._id != null)}
        toolBarRender={() => [
          <Button
            key="button"
            icon={<PlusOutlined />}
            onClick={() => {
              setCurrentRow(null);
              setModalVisible(true);
            }}
            type="primary"
            size="large"
            style={{ 
              height: 44, 
              padding: '0 24px',
              fontWeight: 600,
              boxShadow: `0 4px 12px ${token.colorPrimary}40`,
            }}
          >
            <span style={{ fontSize: 15 }}>Thêm mới</span>
          </Button>,
        ]}
        columns={columns}
        pagination={{ 
          pageSize: 10, 
          showSizeChanger: true, 
          showTotal: (t) => `Tổng ${t} loại tài liệu`,
          showQuickJumper: true,
        }}
        options={{ 
          reload: true, 
          density: true, 
          fullScreen: true, 
          setting: true,
          search: true,
        }}
        columnsState={{ 
          persistenceKey: 'document-types-table', 
          persistenceType: 'localStorage',
        }}
        scroll={{ x: 900 }}
      />
    </>
  );
}
