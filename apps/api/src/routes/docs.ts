import { Scalar } from '@scalar/hono-api-reference';
import { buildOpenApiDocument } from '../docs/openapi';

const document = buildOpenApiDocument();

const SCALAR_CDN = 'https://cdn.jsdelivr.net/npm/@scalar/api-reference@1.67.0';

export const docsRoutes = Scalar.serve({
  document,
  documentPath: '/openapi.json',
  cdn: SCALAR_CDN,
  pageTitle: 'Secure Chatbox API',
  theme: 'deepSpace',
});
