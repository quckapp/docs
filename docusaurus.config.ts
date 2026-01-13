import {themes as prismThemes} from 'prism-react-renderer';
import type {Config} from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

const config: Config = {
  title: 'QuikApp',
  tagline: 'Enterprise-grade polyglot microservices chat platform',
  favicon: 'img/favicon.ico',

  future: {
    v4: true,
  },

  url: 'https://quikapp.dev',
  baseUrl: '/',

  organizationName: 'quikapp',
  projectName: 'quikapp',

  onBrokenLinks: 'throw',

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebars.ts',
          editUrl: 'https://github.com/quikapp/quikapp/tree/main/docs/',
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    image: 'img/quikapp-social-card.jpg',
    colorMode: {
      defaultMode: 'dark',
      respectPrefersColorScheme: true,
    },
    navbar: {
      title: 'QuikApp',
      logo: {
        alt: 'QuikApp Logo',
        src: 'img/logo.svg',
      },
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'docsSidebar',
          position: 'left',
          label: 'Documentation',
        },
        {
          type: 'docSidebar',
          sidebarId: 'apiSidebar',
          position: 'left',
          label: 'API Reference',
        },
        {
          href: 'https://github.com/quikapp/quikapp',
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
            { label: 'Getting Started', to: '/docs/getting-started' },
            { label: 'Architecture', to: '/docs/architecture/overview' },
            { label: 'Microservices', to: '/docs/microservices/overview' },
          ],
        },
        {
          title: 'API Reference',
          items: [
            { label: 'REST API', to: '/docs/api/rest/' },
            { label: 'WebSocket API', to: '/docs/api/websocket/' },
            { label: 'gRPC API', to: '/docs/api/grpc/' },
          ],
        },
        {
          title: 'Resources',
          items: [
            { label: 'GitHub', href: 'https://github.com/quikapp/quikapp' },
            { label: 'Docker Hub', href: 'https://hub.docker.com/u/quikapp' },
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} QuikApp. Built with Docusaurus.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
      additionalLanguages: ['java', 'kotlin', 'elixir', 'go', 'python', 'bash', 'yaml', 'json', 'sql'],
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
