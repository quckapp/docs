import type {ReactNode} from 'react';
import clsx from 'clsx';
import Heading from '@theme/Heading';
import styles from './styles.module.css';

type FeatureItem = {
  title: string;
  Svg: React.ComponentType<React.ComponentProps<'svg'>>;
  description: ReactNode;
};

const FeatureList: FeatureItem[] = [
  {
    title: 'Polyglot Architecture',
    Svg: require('@site/static/img/undraw_docusaurus_mountain.svg').default,
    description: (
      <>
        Built with 32 microservices across 5 technology stacks: Spring Boot,
        NestJS, Elixir, Go, and Python - each chosen for optimal performance.
      </>
    ),
  },
  {
    title: 'Enterprise Scale',
    Svg: require('@site/static/img/undraw_docusaurus_tree.svg').default,
    description: (
      <>
        Handles millions of concurrent users with sub-second message delivery,
        powered by Kafka, Redis, and distributed caching.
      </>
    ),
  },
  {
    title: 'Real-time Everything',
    Svg: require('@site/static/img/undraw_docusaurus_react.svg').default,
    description: (
      <>
        WebSocket-powered presence, typing indicators, and instant messaging
        with Phoenix Channels and WebRTC for voice/video calls.
      </>
    ),
  },
];

function Feature({title, Svg, description}: FeatureItem) {
  return (
    <div className={clsx('col col--4')}>
      <div className="text--center">
        <Svg className={styles.featureSvg} role="img" />
      </div>
      <div className="text--center padding-horiz--md">
        <Heading as="h3">{title}</Heading>
        <p>{description}</p>
      </div>
    </div>
  );
}

export default function HomepageFeatures(): ReactNode {
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
