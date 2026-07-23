import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Dashboard route registration', () => {
    it('registers the schema registry list and detail routes', () => {
        const source = readFileSync(resolve(process.cwd(), 'dashboard/index.tsx'), 'utf8');
        const routeList = source.match(
            /export const dataHubRoutes[^=]*=\s*\[([\s\S]*?)\]\.map\(wrapWithErrorBoundary\)/,
        );

        expect(routeList?.[1]).toContain('schemasList,');
        expect(routeList?.[1]).toContain('schemaDetail,');
    });
});
