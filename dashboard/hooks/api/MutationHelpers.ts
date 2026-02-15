import { toast } from 'sonner';
import { getErrorMessage } from '../../../shared';

interface MutationErrorOptions {
    showDetails?: boolean;
}

export function createMutationErrorHandler(action: string, options?: MutationErrorOptions) {
    return (error: unknown) => {
        const message = getErrorMessage(error);
        if (options?.showDetails) {
            toast.error(`Failed to ${action}`, { description: message });
        } else {
            toast.error(`Failed to ${action}`);
        }
    };
}

interface MutationSuccessOptions {
    showToast?: boolean;
}

export function createMutationSuccessHandler(message: string, options?: MutationSuccessOptions) {
    return () => {
        if (options?.showToast !== false) {
            toast.success(message);
        }
    };
}

export function handleMutationError(action: string, error: unknown): void {
    const message = getErrorMessage(error);
    toast.error(`Failed to ${action}`, { description: message });
}
