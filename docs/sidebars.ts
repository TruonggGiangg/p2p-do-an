import type { SidebarsConfig } from '@docusaurus/plugin-content-docs';

const sidebars: SidebarsConfig = {
  docs: [
    {
      type: 'category',
      label: '🚀 Bắt đầu',
      link: {
        type: 'generated-index',
        title: 'Bắt đầu với P2P Lending',
        description: 'Hướng dẫn cài đặt và làm quen với dự án',
      },
      items: [
        'getting-started/introduction',
        'getting-started/onboarding',
        'getting-started/environment-setup',
      ],
    },
    {
      type: 'category',
      label: '🏗️ Kiến trúc Hệ thống',
      link: {
        type: 'generated-index',
        title: 'Kiến trúc Hệ thống',
        description: 'Thiết kế và quyết định kỹ thuật của dự án',
      },
      items: [
        'architecture/high-level-design',
        'architecture/technology-radar',
        {
          type: 'category',
          label: '📋 ADR (Decisions)',
          items: [
            'architecture/decisions/adr-001-tech-stack',
          ],
        },
      ],
    },
    {
      type: 'category',
      label: '⚙️ Backend Services',
      items: [
        {
          type: 'category',
          label: '🏦 Loan Service',
          items: [
            'backend-services/service-loan/overview',
            'backend-services/service-loan/loan-creation-flow',
            'backend-services/service-loan/loan-status',
          ]
        },
        {
          type: 'category',
          label: '🔐 Auth Service',
          items: [
            'backend-services/service-auth/overview',
            'backend-services/service-auth/database-schema',
            'backend-services/service-auth/error-codes',
          ]
        }
      ],
    },
    // {
    //   type: 'category',
    //   label: '📱 Frontend Mobile',
    //   items: [...],
    // },
    // {
    //   type: 'category',
    //   label: '📚 API Reference',
    //   items: [...],
    // },
  ],
};

export default sidebars;
