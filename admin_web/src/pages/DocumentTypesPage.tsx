import { useCallback, useRef, useState } from 'react';
import {
  ProTable,
  DrawerForm,
  ProFormText,
  ProFormCheckbox,
  ProFormSelect,
  ProFormTextArea,
} from '@ant-design/pro-components';
import type { ActionType, ProColumns } from '@ant-design/pro-components';
import { Button, Popconfirm, message, Space, Typography, Tag, Input, Form, Divider } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, MinusCircleOutlined, FileOutlined, FontSizeOutlined, UnorderedListOutlined, AppstoreOutlined } from '@ant-design/icons';
import { adminApi, type DocumentTypeDto, type DocumentFieldType } from '../api/admin';

const { Text } = Typography;

const FIELD_TYPE_LABELS: Record<DocumentFieldType, string> = {
  file: 'File đính kèm',
  text: 'Nhập text',
  select: 'Danh sách chọn',
  button: 'Nhóm nút chọn',
};

const FIELD_TYPE_COLORS: Record<DocumentFieldType, string> = {
  file: 'blue',
  text: 'green',
  select: 'orange',
  button: 'purple',
};

const FIELD_TYPE_ICONS: Record<DocumentFieldType, React.ReactNode> = {
  file: <FileOutlined />,
  text: <FontSizeOutlined />,
  select: <UnorderedListOutlined />,
  button: <AppstoreOutlined />,
};

/** Options dynamic list cho select/button */
function OptionsFormList() {
  return (
    <Form.Item noStyle shouldUpdate={(prev, cur) => prev.fieldType !== cur.fieldType}>
      {({ getFieldValue }) => {
        const fieldType = getFieldValue('fieldType') as DocumentFieldType;
        if (fieldType !== 'select' && fieldType !== 'button') return null;
        return (
          <>
            <Divider plain style={{ margin: '8px 0 16px' }}>
              Danh sách giá trị lựa chọn
            </Divider>
            <Form.List name="options" initialValue={['']}>
              {(fields, { add, remove }) => (
                <>
                  {fields.map(({ key, name, ...restField }) => (
                    <Space key={key} style={{ display: 'flex', marginBottom: 8 }} align="baseline">
                      <Form.Item
                        {...restField}
                        name={name}
                        rules={[{ required: true, whitespace: true, message: 'Vui lòng nhập giá trị' }]}
                        style={{ marginBottom: 0, flex: 1 }}
                      >
                        <Input placeholder={`Giá trị ${name + 1}`} />
                      </Form.Item>
                      {fields.length > 1 && (
                        <MinusCircleOutlined
                          onClick={() => remove(name)}
                          style={{ color: '#ff4d4f', cursor: 'pointer' }}
                        />
                      )}
                    </Space>
                  ))}
                  <Form.Item>
                    <Button
                      type="dashed"
                      onClick={() => add('')}
                      block
                      icon={<PlusOutlined />}
                    >
                      Thêm giá trị
                    </Button>
                  </Form.Item>
                </>
              )}
            </Form.List>
          </>
        );
      }}
    </Form.Item>
  );
}

export default function DocumentTypesPage() {
  const actionRef = useRef<ActionType>();
  const [modalVisible, setModalVisible] = useState(false);
  const [currentRow, setCurrentRow] = useState<DocumentTypeDto | null>(null);

  const fetchData = useCallback(async () => {
    actionRef.current?.reload();
  }, []);

  const handleSave = async (values: any) => {
    try {
      // Lọc bỏ giá trị rỗng trong options
      const payload = {
        ...values,
        options: (values.options || []).filter((v: string) => v?.trim()),
      };
      // Nếu fieldType không phải select/button → xóa options
      if (payload.fieldType !== 'select' && payload.fieldType !== 'button') {
        payload.options = [];
      }

      if (currentRow) {
        await adminApi.updateDocumentType(currentRow._id, payload);
        message.success('Cập nhật thành công');
      } else {
        await adminApi.createDocumentType(payload);
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
      valueType: 'select',
      valueEnum: {
        file: { text: 'File đính kèm' },
        text: { text: 'Nhập text' },
        select: { text: 'Danh sách chọn' },
        button: { text: 'Nhóm nút chọn' },
      },
      search: {
        transform: (v) => (v === '' || v === undefined ? undefined : v),
      },
      fieldProps: {
        placeholder: 'Tất cả',
        allowClear: true,
      },
      render: (_, record) => {
        const ft = record.fieldType || 'file';
        return (
          <Tag icon={FIELD_TYPE_ICONS[ft]} color={FIELD_TYPE_COLORS[ft]}>
            {FIELD_TYPE_LABELS[ft]}
          </Tag>
        );
      },
    },
    {
      title: 'Giá trị lựa chọn',
      dataIndex: 'options',
      search: false,
      width: 250,
      ellipsis: true,
      render: (_, record) => {
        if (!record.options?.length) return <Text type="secondary">—</Text>;
        return (
          <Space size={[0, 4]} wrap>
            {record.options.map((opt, idx) => (
              <Tag key={idx}>{opt}</Tag>
            ))}
          </Space>
        );
      },
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
      options: currentRow.options?.length ? currentRow.options : [''],
    }
    : { required: false, fieldType: 'file' as DocumentFieldType, options: [''] };

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

        <ProFormSelect
          name="fieldType"
          label="Loại trường nhập liệu"
          tooltip="Xác định cách người dùng cung cấp thông tin: upload file, nhập text, hoặc chọn từ danh sách"
          fieldProps={{
            optionRender: (option) => (
              <Space>
                {FIELD_TYPE_ICONS[option.value as DocumentFieldType]}
                {option.label}
              </Space>
            ),
          }}
          options={[
            { label: 'File đính kèm (upload)', value: 'file' },
            { label: 'Nhập text tự do', value: 'text' },
            { label: 'Danh sách chọn (dropdown)', value: 'select' },
            { label: 'Nhóm nút chọn (buttons)', value: 'button' },
          ]}
          rules={[{ required: true, message: 'Vui lòng chọn loại trường' }]}
        />

        <OptionsFormList />

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
            if (params.fieldType) {
              filtered = filtered.filter((i) => (i.fieldType || 'file') === params.fieldType);
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
