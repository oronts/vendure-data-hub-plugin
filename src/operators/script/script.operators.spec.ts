import { describe, expect, it } from 'vitest';
import { SAFE_EVALUATOR } from '../../constants/defaults';
import { configureScriptOperators, scriptOperator } from './script.operators';

describe('script operator timeout bounds', () => {
    it.each([0, 1.5, SAFE_EVALUATOR.MAX_TIMEOUT_MS + 1])(
        'rejects invalid runtime timeout %s',
        async timeout => {
            const result = await scriptOperator(
                [{ id: 1 }],
                { code: 'return record;', timeout },
                {} as never,
            );

            expect(result).toMatchObject({
                records: [{ id: 1 }],
                errors: [{ message: expect.stringContaining('timeout must be an integer between') }],
            });
        },
    );

    it('rejects an invalid plugin default before changing global configuration', () => {
        expect(() => configureScriptOperators({
            evaluator: { defaultTimeoutMs: Number.NaN },
        })).toThrow('defaultTimeoutMs must be an integer between');
    });
});
