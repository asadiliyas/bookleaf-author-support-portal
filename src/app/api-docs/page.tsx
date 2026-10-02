import type { Metadata } from "next";
import Script from "next/script";
import { Wordmark } from "@/components/brand";

export const metadata: Metadata = { title: "API documentation" };

const SWAGGER_VERSION = "5.17.14";

/** Swagger UI for /api/v1/openapi.json (loaded from a CDN; the spec itself is generated from our Zod schemas). */
export default function ApiDocsPage() {
  return (
    <div className="min-h-screen bg-white">
      <link rel="stylesheet" href={`https://cdn.jsdelivr.net/npm/swagger-ui-dist@${SWAGGER_VERSION}/swagger-ui.css`} />
      <header className="border-b border-line px-6 py-4">
        <Wordmark subtitle="API Reference" href="/" />
      </header>
      <div id="swagger-ui" className="mx-auto max-w-6xl" />
      <Script
        src={`https://cdn.jsdelivr.net/npm/swagger-ui-dist@${SWAGGER_VERSION}/swagger-ui-bundle.js`}
        strategy="afterInteractive"
      />
      <Script id="swagger-init" strategy="lazyOnload">
        {`(function init(){ if (!window.SwaggerUIBundle) return setTimeout(init, 100);
          window.SwaggerUIBundle({ url: '/api/v1/openapi.json', dom_id: '#swagger-ui', deepLinking: true, persistAuthorization: true, tryItOutEnabled: false });
        })();`}
      </Script>
    </div>
  );
}
