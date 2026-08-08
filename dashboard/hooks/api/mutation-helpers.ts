import { toast } from 'sonner';
import { getErrorMessage } from '../../../shared';

interface MutationErrorOptions {
    showDetails?: boolean;
}

export function createMutationErrorHandler(title: string, options?: MutationErrorOptions) {
    return (error: unknown) => {
        const message = getErrorMessage(error);
        if (options?.showDetails) {
            toast.error(title, { description: message });
        } else {
            toast.error(title);
        }
    };
}

export function handleMutationError(title: string, error: unknown): void {
    const message = getErrorMessage(error);
    toast.error(title, { description: message });
}
