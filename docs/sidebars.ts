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
      label: '💡 Concepts',
      collapsible: true,
      items: [
        'concepts/overview',
        'concepts/money-flow',
      ],
    },
    {
      type: 'category',
      label: '📘 Product Guides',
      collapsible: true,
      items: [
        {
          type: 'category',
          label: 'Lending',
          items: ['guides/lending/invest'],
        },
        {
          type: 'category',
          label: 'Borrowing',
          items: ['guides/borrowing/apply', 'guides/borrowing/repay'],
        },
        {
          type: 'category',
          label: 'Operations',
          items: ['guides/operations/reconciliation'],
        },
      ],
    },
    // {
    //   type: 'category',
    //   label: '📚 API Reference',
    //   items: [
    //      // 'api/loan-api',
    //      // 'api/reconciliation-api',
    //   ]
    // },
  ],
};

export default sidebars;
