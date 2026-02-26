export { getErrorMessage, ensureError, toErrorOrUndefined, getErrorStack } from '../../shared/utils/error';

/** Detects unique constraint violations across MySQL and PostgreSQL */
export function isDuplicateEntryError(msg: string): boolean {
    return (
        msg.includes('UNIQUE') || msg.includes('unique') ||
        msg.includes('duplicate') || msg.includes('Duplicate') ||
        msg.includes('ER_DUP_ENTRY') || msg.includes('23505')
    );
}
