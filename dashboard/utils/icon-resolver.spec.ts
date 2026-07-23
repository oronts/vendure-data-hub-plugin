import { describe, expect, it } from 'vitest';
import { resolveIconName } from './icon-resolver';

describe('resolveIconName', () => {
    it.each(['file-text', 'FileText', 'check-circle-2', 'CheckCircle2'])(
        'resolves supported metadata icon %s',
        name => {
            expect(resolveIconName(name)).toBeTypeOf('object');
        },
    );

    it('returns undefined for unsupported metadata', () => {
        expect(resolveIconName('not-a-supported-icon')).toBeUndefined();
        expect(resolveIconName(null)).toBeUndefined();
    });
});
