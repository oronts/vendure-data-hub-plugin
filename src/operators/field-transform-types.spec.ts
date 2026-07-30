import { describe, expect, it } from 'vitest';
import { FIELD_TRANSFORM_TYPES } from './index';

describe('export wizard field transforms', () => {
    it('advertises only transforms that need no additional wizard configuration', () => {
        expect(FIELD_TRANSFORM_TYPES.map(option => option.value)).toEqual([
            'trim',
            'lowercase',
            'uppercase',
            'stripHtml',
        ]);
    });
});
