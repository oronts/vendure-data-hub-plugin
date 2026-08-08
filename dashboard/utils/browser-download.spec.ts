import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UI_DEFAULTS } from '../constants';
import { downloadBrowserBlob } from './browser-download';

describe('downloadBrowserBlob', () => {
    const click = vi.fn();
    const remove = vi.fn();
    const appendChild = vi.fn();
    const createObjectURL = vi.fn(() => 'blob:data-hub');
    const revokeObjectURL = vi.fn();
    const anchor = { href: '', download: '', click, remove };

    beforeEach(() => {
        vi.useFakeTimers();
        vi.clearAllMocks();
        vi.stubGlobal('document', {
            createElement: vi.fn(() => anchor),
            body: { appendChild },
        });
        vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllGlobals();
    });

    it('clicks an attached anchor and delays object URL revocation', () => {
        const blob = {} as Blob;

        downloadBrowserBlob(blob, 'export.csv');

        expect(createObjectURL).toHaveBeenCalledWith(blob);
        expect(anchor).toMatchObject({
            href: 'blob:data-hub',
            download: 'export.csv',
        });
        expect(appendChild).toHaveBeenCalledWith(anchor);
        expect(click).toHaveBeenCalledOnce();
        expect(remove).toHaveBeenCalledOnce();
        expect(revokeObjectURL).not.toHaveBeenCalled();

        vi.advanceTimersByTime(UI_DEFAULTS.OBJECT_URL_REVOKE_DELAY_MS);

        expect(revokeObjectURL).toHaveBeenCalledWith('blob:data-hub');
    });

    it('removes the anchor and revokes the URL when clicking fails', () => {
        click.mockImplementationOnce(() => {
            throw new Error('download blocked');
        });

        expect(() => downloadBrowserBlob({} as Blob, 'export.csv')).toThrow(
            'download blocked',
        );

        expect(remove).toHaveBeenCalledOnce();
        vi.advanceTimersByTime(UI_DEFAULTS.OBJECT_URL_REVOKE_DELAY_MS);
        expect(revokeObjectURL).toHaveBeenCalledWith('blob:data-hub');
    });
});
