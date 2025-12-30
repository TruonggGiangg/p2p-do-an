/** @type {import('@docusaurus/plugin-content-docs').SidebarsConfig} */
const sidebars = {
  docs: [
    {
      type: 'category',
      label: 'Introduction',
      collapsible: false,
      className: 'section-title',
      items: ['intro/index', 'intro/tech-stack'],
    },
    {
      type: 'category',
      label: '🏗️ Kiến trúc Hệ thống',
      collapsible: true,
      items: [
        'architecture/overview',
        'architecture/auth-keycloak',
        'architecture/blockchain-ledger',
      ],
    },
    {
      type: 'category',
      label: '💡 Nghiệp vụ Cốt lõi',
      collapsible: true,
      items: [
        'concepts/fineract-core',
        'concepts/fineract-products',
        'concepts/fineract-accounting',
        'concepts/business-flow',
      ],
    },
    // Đã xóa phần 'Hướng dẫn Sử dụng' theo yêu cầu
  ],
};

export default sidebars;
