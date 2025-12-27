import type { ReactNode } from 'react';
import clsx from 'clsx';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';
import Heading from '@theme/Heading';

import styles from './index.module.css';

function HomepageHeader() {
  const { siteConfig } = useDocusaurusContext();
  return (
    <header className={clsx('hero', styles.heroBanner)}>
      <div className="container">
        <Heading as="h1" className="hero__title">
          {siteConfig.title}
        </Heading>
        <p className="hero__subtitle">{siteConfig.tagline}</p>
        <div className={styles.buttons}>
          <Link
            className="button button--primary button--lg"
            to="/docs/intro">
            <i className="fas fa-book" style={{ marginRight: '8px' }}></i>
            Bắt đầu tìm hiểu
          </Link>
          <Link
            className="button button--outline button--lg"
            to="/docs/category/api-reference"
            style={{ marginLeft: '12px' }}>
            <i className="fas fa-code" style={{ marginRight: '8px' }}></i>
            API Reference
          </Link>
        </div>
      </div>
    </header>
  );
}

interface FeatureItem {
  title: string;
  icon: string;
  description: ReactNode;
}

const FeatureList: FeatureItem[] = [
  {
    title: 'Blockchain Audit Trail',
    icon: 'fas fa-link',
    description: (
      <>
        Tất cả giao dịch được ghi nhận trên Hyperledger Fabric,
        đảm bảo tính minh bạch và không thể chỉnh sửa.
      </>
    ),
  },
  {
    title: 'Core Banking Fineract',
    icon: 'fas fa-university',
    description: (
      <>
        Tích hợp Apache Fineract - nền tảng core banking mã nguồn mở
        hàng đầu cho quản lý tài khoản và giao dịch.
      </>
    ),
  },
  {
    title: 'Dynamic Interest Rates',
    icon: 'fas fa-chart-line',
    description: (
      <>
        Lãi suất được tính toán tự động dựa trên Credit Score (FICO),
        số tiền vay và kỳ hạn.
      </>
    ),
  },
  {
    title: 'Multi-Lender Support',
    icon: 'fas fa-users',
    description: (
      <>
        Hỗ trợ nhiều nhà đầu tư cùng tham gia vào một khoản vay
        thông qua hệ thống Notes.
      </>
    ),
  },
  {
    title: 'Fixed Deposit Integration',
    icon: 'fas fa-piggy-bank',
    description: (
      <>
        Tự động tạo tài khoản Fixed Deposit cho nhà đầu tư
        với lãi suất guaranteed.
      </>
    ),
  },
  {
    title: 'Real-time Reconciliation',
    icon: 'fas fa-sync-alt',
    description: (
      <>
        Hệ thống đối soát tự động giữa MongoDB, Fineract và Blockchain
        để đảm bảo dữ liệu nhất quán.
      </>
    ),
  },
];

function Feature({ title, icon, description }: FeatureItem) {
  return (
    <div className={clsx('col col--4')}>
      <div className={styles.featureCard}>
        <div className={styles.featureIcon}>
          <i className={icon}></i>
        </div>
        <Heading as="h3">{title}</Heading>
        <p>{description}</p>
      </div>
    </div>
  );
}

function HomepageFeatures(): ReactNode {
  return (
    <section className={styles.features}>
      <div className="container">
        <div className="row">
          {FeatureList.map((props, idx) => (
            <Feature key={idx} {...props} />
          ))}
        </div>
      </div>
    </section>
  );
}

export default function Home(): ReactNode {
  const { siteConfig } = useDocusaurusContext();
  return (
    <Layout
      title="Tài liệu hệ thống"
      description="Nền tảng cho vay ngang hàng với Blockchain và Fineract">
      <HomepageHeader />
      <main>
        <HomepageFeatures />
      </main>
    </Layout>
  );
}
