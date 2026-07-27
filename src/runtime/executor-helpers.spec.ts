import type { RequestContext } from '@vendure/core';
import { describe, expect, it } from 'vitest';
import { LoadStrategy } from '../constants/enums';
import { buildSandboxLoaderContext } from './executor-helpers';

describe('buildSandboxLoaderContext', () => {
    const requestContext = {} as RequestContext;

    it('propagates explicit CREATE duplicate skipping', () => {
        const context = buildSandboxLoaderContext(
            requestContext,
            { strategy: LoadStrategy.CREATE, skipDuplicates: true },
            ['code'],
        );

        expect(context.operation).toBe('CREATE');
        expect(context.options.skipDuplicates).toBe(true);
    });

    it('keeps duplicate skipping disabled by default', () => {
        const context = buildSandboxLoaderContext(
            requestContext,
            { strategy: LoadStrategy.CREATE },
            ['code'],
        );

        expect(context.operation).toBe('CREATE');
        expect(context.options.skipDuplicates).toBe(false);
    });
});
