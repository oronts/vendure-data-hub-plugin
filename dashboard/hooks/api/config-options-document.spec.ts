import { print } from 'graphql';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@vendure/dashboard', () => ({ api: {} }));

import { configOptionsDocument } from './config-options-document';

describe('config options dashboard query', () => {
    it('requests the runtime fields consumed by dynamic forms', () => {
        const query = print(configOptionsDocument);

        expect(query).toContain('validationStrictnesses');
        expect(query).toContain('channelStrategies');
        expect(query).toContain('configKeyMap');
        expect(query).toContain('fieldMapping');
        expect(query).toContain('optionsRef');
        expect(query).not.toContain('runModes');
        expect(query).not.toContain('checkpointStrategies');
    });
});
