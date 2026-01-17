import React, { useEffect, useRef, useState, useCallback } from 'react';
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
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const handleOpenInNewTab = useCallback(() => {
    // Create a standalone HTML page with Swagger UI
    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>API Explorer - ${url.split('/').pop()?.replace('.json', '') || 'Swagger UI'}</title>
  <link rel="stylesheet" href="${window.location.origin}/swagger-ui/swagger-ui.css">
  <style>
    body { margin: 0; padding: 0; }
    #swagger-ui { max-width: 1460px; margin: 0 auto; padding: 20px; }
  </style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="${window.location.origin}/swagger-ui/swagger-ui-bundle.js"></script>
  <script src="${window.location.origin}/swagger-ui/swagger-ui-standalone-preset.js"></script>
  <script>
    window.onload = function() {
      SwaggerUIBundle({
        url: "${window.location.origin}${url}",
        dom_id: '#swagger-ui',
        docExpansion: '${docExpansion}',
        defaultModelsExpandDepth: ${defaultModelsExpandDepth},
        filter: ${filter},
        tryItOutEnabled: true,
        persistAuthorization: true,
        presets: [
          SwaggerUIBundle.presets.apis,
          SwaggerUIStandalonePreset
        ],
        layout: 'StandaloneLayout'
      });
    };
  </script>
</body>
</html>`;

    const blob = new Blob([html], { type: 'text/html' });
    const blobUrl = URL.createObjectURL(blob);
    window.open(blobUrl, '_blank');
  }, [url, docExpansion, defaultModelsExpandDepth, filter]);

  const handleFullscreen = useCallback(() => {
    if (!wrapperRef.current) return;

    if (!isFullscreen) {
      if (wrapperRef.current.requestFullscreen) {
        wrapperRef.current.requestFullscreen();
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    }
  }, [isFullscreen]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

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
    <div ref={wrapperRef} className={`${styles.swaggerWrapper} ${isFullscreen ? styles.fullscreen : ''}`}>
      <div className={styles.toolbar}>
        <button
          className={styles.toolbarButton}
          onClick={handleOpenInNewTab}
          title="Open in new tab"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
            <polyline points="15 3 21 3 21 9" />
            <line x1="10" y1="14" x2="21" y2="3" />
          </svg>
          <span>Open in New Tab</span>
        </button>
        <button
          className={styles.toolbarButton}
          onClick={handleFullscreen}
          title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
        >
          {isFullscreen ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
            </svg>
          )}
          <span>{isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}</span>
        </button>
      </div>
      <div className={styles.swaggerContainer}>
        <div ref={containerRef} className={styles.loading}>
          Loading API documentation...
        </div>
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
