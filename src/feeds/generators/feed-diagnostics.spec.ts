import { describe, expect, it } from 'vitest';
import { FEED_LIMITS } from './feed-constants';
import {
    appendFeedDiagnostics,
    OMITTED_FEED_DIAGNOSTICS,
    recordFeedDiagnostic,
    resolveCustomFeedItemCount,
} from './feed-diagnostics';

describe('feed diagnostics', () => {
    it('bounds individual diagnostic length', () => {
        const target: string[] = [];

        recordFeedDiagnostic(target, 'x'.repeat(FEED_LIMITS.MAX_DIAGNOSTIC_MESSAGE_LENGTH + 10));

        expect(target).toHaveLength(1);
        expect(target[0]).toHaveLength(FEED_LIMITS.MAX_DIAGNOSTIC_MESSAGE_LENGTH);
    });

    it('bounds retained diagnostic entries and records truncation', () => {
        const target: string[] = [];
        const messages = Array.from(
            { length: FEED_LIMITS.MAX_DIAGNOSTIC_ENTRIES + 50 },
            (_, index) => `warning-${index}`,
        );

        appendFeedDiagnostics(target, messages);

        expect(target).toHaveLength(FEED_LIMITS.MAX_DIAGNOSTIC_ENTRIES);
        expect(target[0]).toBe('warning-0');
        expect(target[target.length - 1]).toBe(OMITTED_FEED_DIAGNOSTICS);
    });

    it('validates custom generator item counts', () => {
        expect(resolveCustomFeedItemCount(undefined, 3)).toBe(3);
        expect(resolveCustomFeedItemCount(0, 3)).toBe(0);
        expect(() => resolveCustomFeedItemCount(-1, 3))
            .toThrow('non-negative safe integer');
        expect(() => resolveCustomFeedItemCount(1.5, 3))
            .toThrow('non-negative safe integer');
        expect(() => resolveCustomFeedItemCount(Number.MAX_SAFE_INTEGER + 1, 3))
            .toThrow('non-negative safe integer');
    });
});
