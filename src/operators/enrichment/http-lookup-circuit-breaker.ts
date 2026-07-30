import { CIRCUIT_BREAKER } from '../../constants/defaults';
import { CircuitState } from '../../constants/enums';

export interface CircuitBreakerState {
    failures: number;
    lastActivity: number;
    lastFailure: number;
    state: CircuitState;
    openedAt?: number;
    halfOpenAttempts: number;
    halfOpenSuccesses: number;
    generation: number;
}

export interface CircuitPermit {
    readonly endpoint: string;
    readonly generation: number;
    readonly halfOpen: boolean;
    readonly breaker: CircuitBreakerState;
}

const circuitBreakers = new Map<string, CircuitBreakerState>();

export function acquireCircuitPermit(endpoint: string, now = Date.now()): CircuitPermit | null {
    const breaker = getCircuitBreaker(endpoint, now);
    breaker.lastActivity = now;

    if (breaker.state === CircuitState.OPEN) {
        if (
            breaker.openedAt === undefined ||
            now - breaker.openedAt < CIRCUIT_BREAKER.RESET_TIMEOUT_MS
        ) {
            return null;
        }
        enterHalfOpen(breaker);
    }

    if (breaker.state === CircuitState.HALF_OPEN) {
        if (breaker.halfOpenAttempts >= CIRCUIT_BREAKER.SUCCESS_THRESHOLD) return null;
        breaker.halfOpenAttempts += 1;
        return createPermit(endpoint, breaker, true);
    }

    return createPermit(endpoint, breaker, false);
}

function getCircuitBreaker(endpoint: string, now: number): CircuitBreakerState {
    const existing = circuitBreakers.get(endpoint);
    if (existing) return existing;
    evictOldestCircuitIfFull();
    const created: CircuitBreakerState = {
        failures: 0,
        lastActivity: now,
        lastFailure: 0,
        state: CircuitState.CLOSED,
        halfOpenAttempts: 0,
        halfOpenSuccesses: 0,
        generation: 0,
    };
    circuitBreakers.set(endpoint, created);
    return created;
}

function evictOldestCircuitIfFull(): void {
    if (circuitBreakers.size < CIRCUIT_BREAKER.MAX_CIRCUITS) return;
    const oldestKey = circuitBreakers.keys().next().value as string | undefined;
    if (oldestKey !== undefined) circuitBreakers.delete(oldestKey);
}

function enterHalfOpen(breaker: CircuitBreakerState): void {
    breaker.state = CircuitState.HALF_OPEN;
    breaker.failures = 0;
    breaker.halfOpenAttempts = 0;
    breaker.halfOpenSuccesses = 0;
    breaker.generation += 1;
}

function createPermit(
    endpoint: string,
    breaker: CircuitBreakerState,
    halfOpen: boolean,
): CircuitPermit {
    return { endpoint, generation: breaker.generation, halfOpen, breaker };
}

export function recordCircuitSuccess(permit: CircuitPermit, now = Date.now()): void {
    const breaker = getCurrentBreaker(permit);
    if (!breaker) return;
    breaker.lastActivity = now;

    if (!permit.halfOpen) {
        if (breaker.state === CircuitState.CLOSED) breaker.failures = 0;
        return;
    }

    if (breaker.state !== CircuitState.HALF_OPEN) return;
    breaker.halfOpenSuccesses += 1;
    if (breaker.halfOpenSuccesses < CIRCUIT_BREAKER.SUCCESS_THRESHOLD) return;

    breaker.failures = 0;
    breaker.state = CircuitState.CLOSED;
    breaker.openedAt = undefined;
    breaker.halfOpenAttempts = 0;
    breaker.halfOpenSuccesses = 0;
}

export function recordCircuitFailure(permit: CircuitPermit, now = Date.now()): void {
    const breaker = getCurrentBreaker(permit);
    if (!breaker) return;
    breaker.lastActivity = now;

    if (permit.halfOpen && breaker.state === CircuitState.HALF_OPEN) {
        openCircuit(breaker, now);
        return;
    }
    if (breaker.state !== CircuitState.CLOSED) return;

    if (breaker.lastFailure > 0 && now - breaker.lastFailure > CIRCUIT_BREAKER.FAILURE_WINDOW_MS) {
        breaker.failures = 0;
    }
    breaker.failures += 1;
    breaker.lastFailure = now;
    if (breaker.failures >= CIRCUIT_BREAKER.FAILURE_THRESHOLD) openCircuit(breaker, now);
}

function getCurrentBreaker(permit: CircuitPermit): CircuitBreakerState | undefined {
    const breaker = circuitBreakers.get(permit.endpoint);
    return breaker === permit.breaker && breaker.generation === permit.generation
        ? breaker
        : undefined;
}

function openCircuit(breaker: CircuitBreakerState, now: number): void {
    breaker.state = CircuitState.OPEN;
    breaker.openedAt = now;
    breaker.lastFailure = now;
    breaker.generation += 1;
}

export function getCircuitBreakerStats(): Map<string, CircuitBreakerState> {
    return new Map(
        [...circuitBreakers].map(([endpoint, state]) => [endpoint, { ...state }]),
    );
}

export function resetCircuitBreaker(endpoint: string): void {
    circuitBreakers.delete(endpoint);
}

export function resetAllCircuitBreakers(): void {
    circuitBreakers.clear();
}

export function cleanStaleCircuitBreakers(now = Date.now()): void {
    for (const [endpoint, breaker] of circuitBreakers) {
        if (
            breaker.state === CircuitState.CLOSED &&
            now - breaker.lastActivity > CIRCUIT_BREAKER.IDLE_TIMEOUT_MS
        ) {
            circuitBreakers.delete(endpoint);
        }
    }
}
