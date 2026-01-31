import { toast } from 'sonner';

export interface MutationErrorOptions {
    showDetails?: boolean;
}

export function createMutationErrorHandler(action: string, options?: MutationErrorOptions) {
    return (error: unknown) => {
        const message = error instanceof Error ? error.message : 'Unknown error';
        if (options?.showDetails) {
            toast.error(`Failed to ${action}`, { description: message });
        } else {
            toast.error(`Failed to ${action}`);
        }
    };
}

export interface MutationSuccessOptions {
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
    const message = error instanceof Error ? error.message : 'Unknown error';
    toast.error(`Failed to ${action}`, { description: message });
}
