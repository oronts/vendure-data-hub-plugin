import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { retentionDaysInputValue } from './retention-input';

describe('Settings retention UX', () => {
    it.each([
        [null, ''],
        [undefined, ''],
        [0, '0'],
        [30, '30'],
    ] as const)('maps server value %s to input value %s', (value, expected) => {
        expect(retentionDaysInputValue(value)).toBe(expected);
    });

    it('keeps permission, responsive layout, and described help in the component contract', () => {
        const source = readFileSync(resolve(__dirname, 'Settings.tsx'), 'utf8');

        expect(source).toContain('<PermissionGuard requires={[DATAHUB_PERMISSIONS.UPDATE_SETTINGS]}>');
        expect(source.match(/grid grid-cols-1 md:grid-cols-2/g)).toHaveLength(2);

        const helpById = {
            'runs-days-feedback': 'keep completed runs indefinitely',
            'errors-days-feedback': 'keep failed records indefinitely',
            'logs-days-feedback': 'keep log entries indefinitely',
        } as const;

        for (const [id, help] of Object.entries(helpById)) {
            expect(source).toContain(`aria-describedby="${id}"`);
            expect(source).toMatch(new RegExp(`<div id="${id}">[\\s\\S]*?${help}`));
        }
    });
});
