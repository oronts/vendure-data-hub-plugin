import { describe, expect, it } from 'vitest';
import { requireSuccessfulQueueMutation } from './queue-mutation-result';

describe('requireSuccessfulQueueMutation', () => {
    it('returns success for a successful mutation result', () => {
        expect(requireSuccessfulQueueMutation(true, 'failed')).toBe(true);
    });

    it('rejects a false mutation result with the provided message', () => {
        expect(() => requireSuccessfulQueueMutation(false, 'consumer failed'))
            .toThrow('consumer failed');
    });
});
