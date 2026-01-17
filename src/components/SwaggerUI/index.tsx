import React, { useEffect, useRef, useState } from 'react';
import BrowserOnly from '@docusaurus/BrowserOnly';
import styles from './styles.module.css';

interface SwaggerUIProps {
  url: string;
  docExpansion?: 'list' | 'full' | 'none';
  defaultModelsExpandDepth?: number;
  filter?: boolean;
}

function SwaggerUILoader({ url, docExpansion = 'list', defaultModelsExpandDepth = 1, filter = true }: SwaggerUIProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const loadSwaggerUI = async () => {
      try {
        // Import swagger-ui-dist
        const SwaggerUIBundle = (await import('swagger-ui-dist/swagger-ui-bundle')).default;

        // Import CSS
        await import('swagger-ui-dist/swagger-ui.css');

        if (mounted && containerRef.current) {
          // Clear loading text
          containerRef.current.textContent = '';

          SwaggerUIBundle({
            url,
            domNode: containerRef.current,
            docExpansion,
            defaultModelsExpandDepth,
            filter,
            tryItOutEnabled: true,
            persistAuthorization: true,
            presets: [
              SwaggerUIBundle.presets.apis,
              SwaggerUIBundle.SwaggerUIStandalonePreset,
            ],
            plugins: [
              SwaggerUIBundle.plugins.DownloadUrl,
            ],
            layout: 'BaseLayout',
          });
        }
      } catch (err) {
        console.error('Failed to load Swagger UI:', err);
        if (mounted) {
          setError('Failed to load API documentation');
        }
      }
    };

    loadSwaggerUI();

    return () => {
      mounted = false;
    };
  }, [url, docExpansion, defaultModelsExpandDepth, filter]);

  if (error) {
    return <div className={styles.loading}>{error}</div>;
  }

  return (
    <div className={styles.swaggerContainer}>
      <div ref={containerRef} className={styles.loading}>
        Loading API documentation...
      </div>
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
