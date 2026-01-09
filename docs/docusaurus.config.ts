import { themes as prismThemes } from 'prism-react-renderer';
import type { Config } from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

const config: Config = {
  title: 'P2P Lending Platform',
  tagline: 'Nền tảng cho vay ngang hàng với Blockchain & Fineract',
  favicon: 'img/favicon.ico',

  // ✅ Enable Mermaid diagrams
  markdown: {
    mermaid: true,
  },
  onBrokenMarkdownLinks: 'warn',

  url: 'https://p2p-lending.example.com',
  baseUrl: '/',

  organizationName: 'trungtoan46',
  projectName: 'p2p',

  onBrokenLinks: 'warn',
  // onBrokenMarkdownLinks: 'warn', // Deprecated
  themes: ['@docusaurus/theme-mermaid'],

  // ✅ Enable diagram zoom
  clientModules: [
    require.resolve('./src/modules/mermaid-zoom.js'),
  ],

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
          editUrl: 'https://github.com/trungtoan46/p2p/tree/main/doc_server/',
        },
        blog: {
          showReadingTime: true,
          feedOptions: {
            type: ['rss', 'atom'],
            xslt: true,
          },
          editUrl: 'https://github.com/trungtoan46/p2p/tree/main/doc_server/',
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
          label: 'Tài liệu',
        },
        {
          to: '/docs/05-api-reference/rest-api',
          label: 'API',
          position: 'left',
        },
        { to: '/blog', label: 'Changelog', position: 'left' },
        {
          href: 'https://github.com/trungtoan46/p2p',
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
              to: '/docs/getting-started/introduction',
            },
            {
              label: 'Kiến trúc',
              to: '/docs/architecture/high-level-design',
            },
          ],
        },
        {
          title: 'Công nghệ',
          items: [
            {
              label: 'Apache Fineract',
              href: 'https://fineract.apache.org/',
            },
            {
              label: 'Hyperledger Fabric',
              href: 'https://www.hyperledger.org/projects/fabric',
            },
            {
              label: 'Keycloak',
              href: 'https://www.keycloak.org/',
            },
          ],
        },
        {
          title: 'Liên kết',
          items: [
            {
              label: 'GitHub',
              href: 'https://github.com/trungtoan46/p2p',
            },
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} P2P Lending Platform. Built with Docusaurus.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
      additionalLanguages: ['bash', 'json', 'typescript'],
    },
    // Mermaid theme configuration - auto switch with colorMode
    mermaid: {
      theme: { light: 'default', dark: 'dark' },
      options: {
        securityLevel: 'loose',
        startOnLoad: true,
      },
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
