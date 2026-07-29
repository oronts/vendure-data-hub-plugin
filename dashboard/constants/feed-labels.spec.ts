import { describe, expect, it } from 'vitest';
import { FEED_TRANSLATION_IDS } from './feed-labels';

describe('feed translation IDs', () => {
    it('uses unique stable IDs in the feeds namespace', () => {
        const ids = Object.values(FEED_TRANSLATION_IDS);

        expect(ids.every(id => id.startsWith('feeds.'))).toBe(true);
        expect(new Set(ids).size).toBe(ids.length);
    });
});
