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

export function handleMutationError(title: string, error: unknown): void {
    const message = getErrorMessage(error);
    toast.error(title, { description: message });
}
