import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMutationErrorHandler, handleMutationError } from './mutation-helpers';

const toastError = vi.hoisted(() => vi.fn());

vi.mock('sonner', () => ({
    toast: {
        error: toastError,
    },
}));

describe('mutation error helpers', () => {
    beforeEach(() => {
        toastError.mockReset();
    });

    it('uses the complete caller-provided title without constructing English', () => {
        createMutationErrorHandler('translated.failure')(new Error('details'));

        expect(toastError).toHaveBeenCalledWith('translated.failure');
    });

    it('preserves optional error details', () => {
        createMutationErrorHandler('translated.failure', { showDetails: true })(
            new Error('details'),
        );
        handleMutationError('translated.handled', new Error('handled details'));

        expect(toastError).toHaveBeenNthCalledWith(1, 'translated.failure', {
            description: 'details',
        });
        expect(toastError).toHaveBeenNthCalledWith(2, 'translated.handled', {
            description: 'handled details',
        });
    });
});
