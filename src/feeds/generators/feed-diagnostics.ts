import { FEED_LIMITS } from './feed-constants';
import type { FeedGenerationDiagnostics } from './feed-types';

export const OMITTED_FEED_DIAGNOSTICS = 'Additional feed diagnostics omitted';

export function recordGeneratedFeedItem(
    diagnostics: FeedGenerationDiagnostics | undefined,
): void {
    if (diagnostics) {
        diagnostics.itemCount++;
    }
}

export function recordFeedDiagnostic(
    target: string[],
    message: string,
): void {
    if (target.length >= FEED_LIMITS.MAX_DIAGNOSTIC_ENTRIES) return;
    if (target.length === FEED_LIMITS.MAX_DIAGNOSTIC_ENTRIES - 1) {
        target.push(OMITTED_FEED_DIAGNOSTICS);
        return;
    }
    target.push(
        message.slice(
            0,
            FEED_LIMITS.MAX_DIAGNOSTIC_MESSAGE_LENGTH,
        ),
    );
}

export function appendFeedDiagnostics(
    target: string[],
    messages: readonly string[] | undefined,
): void {
    if (!messages) return;
    for (const message of messages) {
        recordFeedDiagnostic(target, message);
        if (target[target.length - 1] === OMITTED_FEED_DIAGNOSTICS) return;
    }
}

export function recordFeedItemWarning(
    diagnostics: FeedGenerationDiagnostics | undefined,
    message: string,
): string {
    if (diagnostics) {
        recordFeedDiagnostic(diagnostics.warnings, message);
    }
    return message;
}

export function resolveCustomFeedItemCount(
    reported: number | undefined,
    fallback: number,
): number {
    if (reported === undefined) return fallback;
    if (!Number.isSafeInteger(reported) || reported < 0) {
        throw new Error('Custom feed generator itemCount must be a non-negative safe integer');
    }
    return reported;
}
