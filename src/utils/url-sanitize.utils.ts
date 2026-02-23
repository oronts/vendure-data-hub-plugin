/**
 * URL Sanitization Utilities
 *
 * Provides URL sanitization for safe logging, removing sensitive information
 * such as query parameters (which may contain tokens) or embedded credentials.
 */

export interface SanitizeUrlOptions {
    /** Strip query parameters (e.g., ?token=xxx). Default: true */
    stripQueryParams?: boolean;
    /** Strip embedded credentials (e.g., user:pass@host). Default: true */
    stripCredentials?: boolean;
    /** Fallback string when URL is invalid. Default: '<invalid-url>' */
    invalidFallback?: string;
}

const DEFAULT_OPTIONS: Required<SanitizeUrlOptions> = {
    stripQueryParams: true,
    stripCredentials: true,
    invalidFallback: '<invalid-url>',
};

/**
 * Sanitize a URL for safe logging by removing sensitive information.
 *
 * Supports two sanitization strategies (both enabled by default):
 * - Strip query parameters: removes ?token=xxx, ?key=abc, etc.
 * - Strip credentials: removes user:pass@ from the URL
 *
 * @param url - The URL to sanitize
 * @param options - Sanitization options
 * @returns Sanitized URL string safe for logging
 */
export function sanitizeUrlForLogging(url: string, options?: SanitizeUrlOptions): string {
    const opts = { ...DEFAULT_OPTIONS, ...options };

    try {
        const parsed = new URL(url);

        if (opts.stripCredentials) {
            parsed.username = '';
            parsed.password = '';
        }

        if (opts.stripQueryParams) {
            return parsed.origin + parsed.pathname;
        }

        return parsed.toString();
    } catch {
        return opts.invalidFallback;
    }
}
