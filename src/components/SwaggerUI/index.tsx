import React, { useState, useEffect, ComponentType } from 'react';
import BrowserOnly from '@docusaurus/BrowserOnly';
import styles from './styles.module.css';

interface SwaggerUIProps {
  url: string;
  docExpansion?: 'list' | 'full' | 'none';
  defaultModelsExpandDepth?: number;
  filter?: boolean;
}

interface SwaggerUIReactProps {
  url: string;
  docExpansion?: string;
  defaultModelsExpandDepth?: number;
  filter?: boolean;
  tryItOutEnabled?: boolean;
  persistAuthorization?: boolean;
}

function SwaggerUILoader({ url, docExpansion = 'list', defaultModelsExpandDepth = 1, filter = true }: SwaggerUIProps) {
  const [SwaggerUI, setSwaggerUI] = useState<ComponentType<SwaggerUIReactProps> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    // Load swagger-ui-react dynamically
    import('swagger-ui-react')
      .then((module) => {
        if (mounted) {
          // Import CSS
          import('swagger-ui-react/swagger-ui.css');
          setSwaggerUI(() => module.default);
        }
      })
      .catch((err) => {
        if (mounted) {
          setError(`Failed to load Swagger UI: ${err.message}`);
        }
      });

    return () => {
      mounted = false;
    };
  }, []);

  if (error) {
    return <div className={styles.loading}>{error}</div>;
  }

  if (!SwaggerUI) {
    return <div className={styles.loading}>Loading API documentation...</div>;
  }

  return (
    <div className={styles.swaggerContainer}>
      <SwaggerUI
        url={url}
        docExpansion={docExpansion}
        defaultModelsExpandDepth={defaultModelsExpandDepth}
        filter={filter}
        tryItOutEnabled={true}
        persistAuthorization={true}
      />
    </div>
  );
}

function SwaggerUIComponent(props: SwaggerUIProps) {
  return (
    <BrowserOnly fallback={<div className={styles.loading}>Loading API documentation...</div>}>
      {() => <SwaggerUILoader {...props} />}
    </BrowserOnly>
  );
}

export default SwaggerUIComponent;
