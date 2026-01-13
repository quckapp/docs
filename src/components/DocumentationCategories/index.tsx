import React, { useState } from 'react';
import clsx from 'clsx';
import Link from '@docusaurus/Link';
import styles from './styles.module.css';

type DocItem = {
  title: string;
  description: string;
  link: string;
};

type DocCategory = {
  title: string;
  icon: string;
  description: string;
  items: DocItem[];
};

const categories: DocCategory[] = [
  {
    title: 'Requirements & Planning',
    icon: '📋',
    description: 'Documents that define what QuikApp should do and why',
    items: [
      {
        title: 'Software Requirements Specification (SRS)',
        description: 'Functional & non-functional requirements',
        link: '/docs/requirements/srs',
      },
      {
        title: 'Business Requirements Document (BRD)',
        description: 'Business goals and stakeholder needs',
        link: '/docs/requirements/brd',
      },
      {
        title: 'Product Requirements Document (PRD)',
        description: 'Product vision and user stories',
        link: '/docs/requirements/prd',
      },
    ],
  },
  {
    title: 'Design & Architecture',
    icon: '🏗️',
    description: 'Documents explaining how the system is built',
    items: [
      {
        title: 'System Architecture Document',
        description: 'High-level system design and components',
        link: '/docs/design/system-architecture',
      },
      {
        title: 'Database Design Document',
        description: 'ER diagrams, tables, and relationships',
        link: '/docs/design/database-design',
      },
      {
        title: 'UI/UX Design Documents',
        description: 'Wireframes, mockups, and design guidelines',
        link: '/docs/design/ui-ux-design',
      },
    ],
  },
  {
    title: 'Development',
    icon: '💻',
    description: 'Documents to help build and maintain the system',
    items: [
      {
        title: 'Technical Design Document (TDD)',
        description: 'Detailed module and component designs',
        link: '/docs/development/technical-design',
      },
      {
        title: 'API Documentation',
        description: 'Endpoints, request/response formats',
        link: '/docs/api/overview',
      },
      {
        title: 'Code Standards',
        description: 'Coding guidelines and best practices',
        link: '/docs/development/code-standards',
      },
    ],
  },
  {
    title: 'Testing & Quality',
    icon: '🧪',
    description: 'Documents ensuring the software works correctly',
    items: [
      {
        title: 'Test Plan',
        description: 'Testing strategy and scope',
        link: '/docs/testing/test-plan',
      },
      {
        title: 'Test Cases & Scenarios',
        description: 'Step-by-step test procedures',
        link: '/docs/testing/test-cases',
      },
      {
        title: 'Bug Reports',
        description: 'Issue tracking and defect management',
        link: '/docs/testing/bug-reports',
      },
    ],
  },
  {
    title: 'Operations',
    icon: '🚀',
    description: 'Documents covering deployment and support',
    items: [
      {
        title: 'Deployment Guide',
        description: 'Installation steps and configuration',
        link: '/docs/operations/deployment-guide',
      },
      {
        title: 'Release Notes',
        description: 'New features, bug fixes, known issues',
        link: '/docs/operations/release-notes',
      },
      {
        title: 'Maintenance Guide',
        description: 'Troubleshooting and support procedures',
        link: '/docs/operations/maintenance-guide',
      },
    ],
  },
];

function CategoryCard({ category }: { category: DocCategory }) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className={clsx(styles.categoryCard, isExpanded && styles.expanded)}>
      <button
        className={styles.categoryHeader}
        onClick={() => setIsExpanded(!isExpanded)}
        aria-expanded={isExpanded}
      >
        <span className={styles.categoryIcon}>{category.icon}</span>
        <div className={styles.categoryInfo}>
          <h3 className={styles.categoryTitle}>{category.title}</h3>
          <p className={styles.categoryDescription}>{category.description}</p>
        </div>
        <span className={clsx(styles.chevron, isExpanded && styles.chevronRotated)}>
          ▼
        </span>
      </button>
      {isExpanded && (
        <div className={styles.categoryItems}>
          {category.items.map((item, idx) => (
            <Link key={idx} to={item.link} className={styles.docItem}>
              <h4 className={styles.docTitle}>{item.title}</h4>
              <p className={styles.docDescription}>{item.description}</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export default function DocumentationCategories(): React.ReactElement {
  return (
    <section className={styles.categories}>
      <div className="container">
        <h2 className={styles.sectionTitle}>Documentation Categories</h2>
        <p className={styles.sectionDescription}>
          Explore QuikApp documentation organized by software development lifecycle phases
        </p>
        <div className={styles.grid}>
          {categories.map((category, idx) => (
            <CategoryCard key={idx} category={category} />
          ))}
        </div>
      </div>
    </section>
  );
}
