import { useCallback, useRef, useState } from 'react';
import {
  ProTable,
  DrawerForm,
  ProFormText,
  ProFormCheckbox,
  ProFormTextArea,
} from '@ant-design/pro-components';
import type { ActionType, ProColumns } from '@ant-design/pro-components';
import { Button, Popconfirm, message, Space, Typography, Tag } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, FileOutlined } from '@ant-design/icons';
import { adminApi, type DocumentTypeDto } from '../api/admin';

const { Text } = Typography;

export default function DocumentTypesPage() {
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
      title: 'Loại trường',
      dataIndex: 'fieldType',
      width: 170,
      align: 'center',
      search: false,
      render: () => (
        <Tag icon={<FileOutlined />} color="blue">
          File đính kèm
        </Tag>
      ),
    },
    {
      title: 'Bắt buộc',
      dataIndex: 'required',
      width: 120,
      align: 'center',
      valueType: 'select',
      valueEnum: {
        true: { text: 'Bắt buộc', status: 'Error' },
        false: { text: 'Không bắt buộc', status: 'Default' },
      },
      search: {
        transform: (v) => (v === '' || v === undefined ? undefined : v),
      },
      fieldProps: {
        placeholder: 'Tất cả',
        allowClear: true,
        options: [
          { label: 'Bắt buộc', value: 'true' },
          { label: 'Không bắt buộc', value: 'false' },
        ],
      },
    },
    {
      title: 'Thao tác',
      valueType: 'option',
      key: 'option',
      align: 'right',
      search: false,
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
    : { required: false };

  return (
    <>
      <DrawerForm
        title={currentRow ? 'Sửa loại tài liệu' : 'Thêm loại tài liệu'}
        open={modalVisible}
        onOpenChange={(open) => {
          setModalVisible(open);
          if (!open) setCurrentRow(null);
        }}
        layout="vertical"
        initialValues={initialValues}
        onFinish={handleSave}
        width={Math.min(520, window.innerWidth * 0.92)}
        drawerProps={{
          destroyOnClose: true,
        }}
      >
        <ProFormText
          name="name"
          label="Tên loại tài liệu"
          placeholder="Ví dụ: CCCD mặt trước"
          rules={[{ required: true, message: 'Vui lòng nhập tên' }]}
        />

        <ProFormTextArea
          name="description"
          label="Mô tả"
          placeholder="Mô tả ngắn gọn về loại tài liệu này (không bắt buộc)"
          fieldProps={{ autoSize: { minRows: 2, maxRows: 4 } }}
        />

        <ProFormCheckbox name="required">Đánh dấu là bắt buộc nộp</ProFormCheckbox>
      </DrawerForm>

      <ProTable<DocumentTypeDto>
        headerTitle="Danh mục loại tài liệu"
        actionRef={actionRef}
        rowKey="_id"
        search={{
          labelWidth: 'auto',
          defaultCollapsed: false,
        }}
        request={async (params) => {
          try {
            const data = await adminApi.getDocumentTypes();
            let filtered = data;
            const name = (params.name as string)?.toLowerCase?.()?.trim?.();
            if (name) filtered = filtered.filter((i) => i.name.toLowerCase().includes(name));
            if (params.required !== undefined && params.required !== '') {
              const isReq = params.required === 'true';
              filtered = filtered.filter((i) => i.required === isReq);
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
        toolBarRender={() => [
          <Button
            key="button"
            icon={<PlusOutlined />}
            onClick={() => {
              setCurrentRow(null);
              setModalVisible(true);
            }}
            type="primary"
          >
            Thêm mới
          </Button>,
        ]}
        columns={columns}
        pagination={{ pageSize: 10, showSizeChanger: true, showTotal: (t) => `${t} loại tài liệu` }}
        options={{ reload: true, density: true, fullScreen: true, setting: true }}
        columnsState={{ persistenceKey: 'document-types-table', persistenceType: 'localStorage' }}
      />
    </>
  );
}
