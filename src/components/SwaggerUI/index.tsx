import React, { useEffect, useRef, useState } from 'react';
import BrowserOnly from '@docusaurus/BrowserOnly';
import styles from './styles.module.css';

interface SwaggerUIProps {
  url: string;
  docExpansion?: 'list' | 'full' | 'none';
  defaultModelsExpandDepth?: number;
  filter?: boolean;
}

declare global {
  interface Window {
    SwaggerUIBundle: any;
    SwaggerUIStandalonePreset: any;
  }
}

function SwaggerUILoader({ url, docExpansion = 'list', defaultModelsExpandDepth = 1, filter = true }: SwaggerUIProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let mounted = true;

    const loadSwaggerUI = async () => {
      try {
        // Check if already loaded
        if (window.SwaggerUIBundle) {
          if (mounted) setLoaded(true);
          return;
        }

        // Load CSS from local static files
        const cssLink = document.createElement('link');
        cssLink.rel = 'stylesheet';
        cssLink.href = '/swagger-ui/swagger-ui.css';
        document.head.appendChild(cssLink);

        // Load SwaggerUIBundle from local static files
        const bundleScript = document.createElement('script');
        bundleScript.src = '/swagger-ui/swagger-ui-bundle.js';
        bundleScript.async = true;

        const presetScript = document.createElement('script');
        presetScript.src = '/swagger-ui/swagger-ui-standalone-preset.js';
        presetScript.async = true;

        // Wait for both scripts to load
        await new Promise<void>((resolve, reject) => {
          let bundleLoaded = false;
          let presetLoaded = false;

          bundleScript.onload = () => {
            bundleLoaded = true;
            if (presetLoaded) resolve();
          };
          bundleScript.onerror = reject;

          presetScript.onload = () => {
            presetLoaded = true;
            if (bundleLoaded) resolve();
          };
          presetScript.onerror = reject;

          document.body.appendChild(bundleScript);
          document.body.appendChild(presetScript);
        });

        if (mounted) setLoaded(true);
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
  }, []);

  useEffect(() => {
    if (!loaded || !containerRef.current || !window.SwaggerUIBundle) return;

    // Clear loading text
    containerRef.current.textContent = '';

    window.SwaggerUIBundle({
      url,
      domNode: containerRef.current,
      docExpansion,
      defaultModelsExpandDepth,
      filter,
      tryItOutEnabled: true,
      persistAuthorization: true,
      presets: [
        window.SwaggerUIBundle.presets.apis,
        window.SwaggerUIStandalonePreset,
      ],
      layout: 'StandaloneLayout',
    });
  }, [loaded, url, docExpansion, defaultModelsExpandDepth, filter]);

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
