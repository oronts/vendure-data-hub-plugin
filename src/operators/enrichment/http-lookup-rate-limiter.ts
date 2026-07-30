import { CIRCUIT_BREAKER, HTTP_LOOKUP } from '../../constants/defaults';
import { TIME_UNITS } from '../../../shared/constants';
import { sleep } from '../../utils/retry.utils';

export interface RateLimitState {
    tokens: number;
    lastRefill: number;
    lastActivity: number;
    requestsInWindow: number;
    windowStart: number;
    limit: number;
}

const rateLimiters = new Map<string, RateLimitState>();
export async function waitForHttpLookupRateLimit(
    endpoint: string,
    requestsPerSecond: number = HTTP_LOOKUP.DEFAULT_RATE_LIMIT_PER_SECOND,
): Promise<void> {
    const origin = new URL(endpoint).origin;
    const key = `${origin}\u0000${requestsPerSecond}`;
    const now = Date.now();
    const state = getRateLimiter(key, requestsPerSecond, now);
    const elapsed = Math.max(0, now - state.lastRefill);
    const refilled = state.tokens + elapsed * requestsPerSecond / TIME_UNITS.SECOND;
    state.tokens = Math.min(requestsPerSecond, refilled) - 1;
    state.lastRefill = now;
    state.lastActivity = now;
    updateWindow(state, now);

    const waitTime = state.tokens < 0
        ? Math.ceil(-state.tokens * TIME_UNITS.SECOND / requestsPerSecond)
        : 0;
    if (waitTime > 0) await sleep(waitTime);
}

function getRateLimiter(key: string, limit: number, now: number): RateLimitState {
    const existing = rateLimiters.get(key);
    if (existing) return existing;
    evictOldestLimiterIfFull();
    const created: RateLimitState = {
        tokens: limit,
        lastRefill: now,
        lastActivity: now,
        requestsInWindow: 0,
        windowStart: now,
        limit,
    };
    rateLimiters.set(key, created);
    return created;
}

function evictOldestLimiterIfFull(): void {
    if (rateLimiters.size < CIRCUIT_BREAKER.MAX_CIRCUITS) return;
    const oldestKey = rateLimiters.keys().next().value as string | undefined;
    if (oldestKey !== undefined) rateLimiters.delete(oldestKey);
}

function updateWindow(state: RateLimitState, now: number): void {
    if (now - state.windowStart >= TIME_UNITS.SECOND) {
        state.requestsInWindow = 0;
        state.windowStart = now;
    }
    state.requestsInWindow += 1;
}

export function getRateLimiterStats(): Map<string, RateLimitState> {
    return new Map([...rateLimiters].map(([key, state]) => [key, { ...state }]));
}

export function resetAllRateLimiters(): void {
    rateLimiters.clear();
}

export function cleanStaleRateLimiters(now = Date.now()): void {
    for (const [key, limiter] of rateLimiters) {
        if (now - limiter.lastActivity > CIRCUIT_BREAKER.IDLE_TIMEOUT_MS) {
            rateLimiters.delete(key);
        }
    }
}
