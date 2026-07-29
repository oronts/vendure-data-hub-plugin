import { describe, expect, it, vi } from 'vitest';
import { RUN_STATUS_TRANSLATION_IDS } from '../../constants';
import { localizeQueueRunStatus } from './queue-localization';

describe('localizeQueueRunStatus', () => {
    it('translates known run statuses through the shared status catalog', () => {
        const translate = vi.fn((id: string) => `translated:${id}`);

        expect(localizeQueueRunStatus('FAILED', translate)).toBe(
            `translated:${RUN_STATUS_TRANSLATION_IDS.FAILED}`,
        );
        expect(translate).toHaveBeenCalledWith(RUN_STATUS_TRANSLATION_IDS.FAILED);
    });

    it('preserves unknown runtime statuses verbatim', () => {
        const translate = vi.fn((id: string) => `translated:${id}`);

        expect(localizeQueueRunStatus('CUSTOM_RUNTIME_STATUS', translate)).toBe(
            'CUSTOM_RUNTIME_STATUS',
        );
        expect(translate).not.toHaveBeenCalled();
    });
});
