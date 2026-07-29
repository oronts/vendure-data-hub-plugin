import { describe, expect, it } from 'vitest';
import { SAFE_EVALUATOR } from '../../constants/defaults';
import { SafeEvaluator } from './safe-evaluator';

describe('SafeEvaluator resource limits', () => {
    it.each([
        { maxCacheSize: 0 },
        { maxCacheSize: SAFE_EVALUATOR.MAX_CACHE_SIZE + 1 },
        { maxCacheSize: 1.5 },
        { defaultTimeoutMs: 0 },
        { defaultTimeoutMs: SAFE_EVALUATOR.MAX_TIMEOUT_MS + 1 },
        { defaultTimeoutMs: Number.POSITIVE_INFINITY },
    ])('rejects invalid constructor config', config => {
        expect(() => new SafeEvaluator(config)).toThrow('must be an integer between');
    });

    it('rejects an invalid per-evaluation timeout before VM execution', () => {
        const evaluator = new SafeEvaluator();

        expect(evaluator.evaluate('value + 1', { value: 1 }, 0)).toMatchObject({
            success: false,
            error: expect.stringContaining('timeoutMs must be an integer between'),
        });
    });
});
