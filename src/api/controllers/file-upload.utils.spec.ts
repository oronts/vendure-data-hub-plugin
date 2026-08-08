import { describe, expect, it } from 'vitest';
import { getBase64DecodedSize } from './file-upload.utils';

describe('getBase64DecodedSize', () => {
    it.each([
        ['', 0],
        ['QQ==', 1],
        ['QUI=', 2],
        ['QUJD', 3],
        ['QUJDRA==', 4],
    ])('calculates the exact decoded size for %s', (value, expected) => {
        expect(getBase64DecodedSize(value)).toBe(expected);
    });

    it('handles data URI prefixes and insignificant whitespace', () => {
        expect(getBase64DecodedSize('data:text/plain;base64, Q U J D R A = =\n')).toBe(4);
    });
});
