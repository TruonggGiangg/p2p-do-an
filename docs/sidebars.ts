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
        'architecture/blockchain-ledger', // Đã thêm
      ],
    },
    {
      type: 'category',
      label: '💡 Nghiệp vụ Cốt lõi',
      collapsible: true,
      items: [
        'concepts/overview',
        'concepts/fineract-core',
        'concepts/money-flow',
        'concepts/business-flow',
      ],
    },
    {
      type: 'category',
      label: '📘 Hướng dẫn Sử dụng',
      collapsible: true,
      items: [
        {
          type: 'category',
          label: 'Vay vốn (Borrowing)',
          items: ['guides/borrowing/apply', 'guides/borrowing/repay'],
        },
        {
          type: 'category',
          label: 'Đầu tư (Lending)',
          items: ['guides/lending/invest'],
        },
        {
          type: 'category',
          label: 'Vận hành (Operations)',
          items: ['guides/operations/reconciliation'],
        },
      ],
    },
  ],
};

export default sidebars;
