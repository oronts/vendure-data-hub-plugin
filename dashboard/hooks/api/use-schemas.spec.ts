import { print } from 'graphql';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@vendure/dashboard', () => ({ api: {} }));

import { schemaDetailDocument, schemaUsageDocument } from './use-schemas';

describe('schema dashboard queries', () => {
    it('keeps usage discovery out of the route-critical detail query', () => {
        expect(print(schemaDetailDocument)).not.toContain('usedBy');
        expect(print(schemaUsageDocument)).toContain('usedBy');
    });
});
