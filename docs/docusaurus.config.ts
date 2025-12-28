import { themes as prismThemes } from 'prism-react-renderer';
import type { Config } from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

const config: Config = {
  title: 'P2P Lending Platform',
  tagline: 'Nền tảng cho vay ngang hàng với Blockchain & Fineract',
  favicon: 'img/favicon.ico',

  future: {
    v4: true,
  },

  clientModules: [
    require.resolve('./src/modules/mermaid-zoom.js'),
  ],

  // ✅ Enable Mermaid diagrams
  markdown: {
    mermaid: true,
  },
  themes: ['@docusaurus/theme-mermaid'],

  url: 'https://p2p-lending.example.com',
  baseUrl: '/',

  organizationName: 'TruonggGiangg',
  projectName: 'p2p-iuh-vlu',

  onBrokenLinks: 'throw',

  i18n: {
    defaultLocale: 'vi',
    locales: ['vi', 'en'],
  },

  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebars.ts',
          editUrl: 'https://github.com/TruonggGiangg/p2p-iuh-vlu/tree/main/docs/',
        },
        blog: {
          showReadingTime: true,
          feedOptions: {
            type: ['rss', 'atom'],
            xslt: true,
          },
          editUrl: 'https://github.com/TruonggGiangg/p2p-iuh-vlu/tree/main/docs/',
          onInlineTags: 'warn',
          onInlineAuthors: 'warn',
          onUntruncatedBlogPosts: 'warn',
        },
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    image: 'img/p2p-social-card.jpg',
    colorMode: {
      defaultMode: 'dark',
      respectPrefersColorScheme: true,
    },
    navbar: {
      title: 'P2P Lending',
      logo: {
        alt: 'P2P Lending Logo',
        src: 'img/logo.svg',
      },
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'docs',
          position: 'left',
          label: 'Documentation',
        },
        {
          to: '/docs/api/loan-api',
          label: 'API',
          position: 'left',
        },
        { to: '/blog', label: 'Changelog', position: 'left' },
        {
          href: 'https://github.com/TruonggGiangg/p2p-iuh-vlu',
          label: 'GitHub',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Documentation',
          items: [
            {
              label: 'Bắt đầu',
              to: '/docs/intro',
            },
            {
              label: 'Kiến trúc',
              to: '/docs/concepts/overview',
            },
          ],
        },
        {
          title: 'Liên kết',
          items: [
            {
              label: 'GitHub',
              href: 'https://github.com/TruonggGiangg/p2p-iuh-vlu',
            },
            {
              label: 'Fineract',
              href: 'https://fineract.apache.org/',
            },
            {
              label: 'Hyperledger Fabric',
              href: 'https://www.hyperledger.org/projects/fabric',
            },
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} P2P Lending Platform - IUH/VLU. Built with Docusaurus.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
      additionalLanguages: ['bash', 'json', 'typescript'],
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
