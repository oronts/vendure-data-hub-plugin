const RECOVERABLE_ERROR_FRAGMENTS = [
    'timeout',
    'connection',
    'temporarily',
] as const;

export function isRecoverableError(error: unknown): boolean {
    if (!(error instanceof Error)) {
        return false;
    }

    const message = error.message.toLowerCase();
    return RECOVERABLE_ERROR_FRAGMENTS.some(fragment => message.includes(fragment));
}
