import { describe, expect, it } from 'vitest';
import { LoadStrategy } from '../../../constants/enums';
import {
    parseOptionalBoolean,
    parseUpsertStrategy,
} from './loader-config.validation';

describe('loader config validation', () => {
    it.each([
        LoadStrategy.CREATE,
        LoadStrategy.UPDATE,
        LoadStrategy.UPSERT,
    ])('accepts the upsert strategy %s', strategy => {
        expect(parseUpsertStrategy(strategy)).toBe(strategy);
    });

    it.each([LoadStrategy.MERGE, 'create', null, 1])(
        'rejects an unsupported upsert strategy: %s',
        strategy => {
            expect(() => parseUpsertStrategy(strategy)).toThrow(
                `Unsupported load strategy "${String(strategy)}"`,
            );
        },
    );

    it('accepts only boolean optional flags', () => {
        expect(parseOptionalBoolean(undefined, 'skipDuplicates')).toBeUndefined();
        expect(parseOptionalBoolean(false, 'skipDuplicates')).toBe(false);
        expect(() => parseOptionalBoolean('true', 'skipDuplicates'))
            .toThrow('skipDuplicates must be a boolean');
    });
});
