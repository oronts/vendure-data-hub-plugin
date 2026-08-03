import { beforeEach, describe, expect, it } from 'vitest';
import { CIRCUIT_BREAKER } from '../../constants/defaults';
import { CircuitState } from '../../constants/enums';
import {
    acquireCircuitPermit,
    getCircuitBreakerStats,
    recordCircuitFailure,
    recordCircuitSuccess,
    resetAllCircuitBreakers,
} from './http-lookup-circuit-breaker';

const ENDPOINT = 'https://example.com';

function requirePermit(now: number) {
    const permit = acquireCircuitPermit(ENDPOINT, now);
    expect(permit).not.toBeNull();
    return permit!;
}

describe('HTTP lookup circuit breaker', () => {
    beforeEach(resetAllCircuitBreakers);

    it('counts only consecutive failures inside the failure window', () => {
        const first = requirePermit(1_000);
        recordCircuitFailure(first, 1_000);
        const success = requirePermit(1_001);
        recordCircuitSuccess(success, 1_001);

        expect(getCircuitBreakerStats().get(ENDPOINT)?.failures).toBe(0);

        const staleFailure = requirePermit(2_000);
        recordCircuitFailure(staleFailure, 2_000);
        const outsideWindow = requirePermit(2_000 + CIRCUIT_BREAKER.FAILURE_WINDOW_MS + 1);
        recordCircuitFailure(outsideWindow, 2_000 + CIRCUIT_BREAKER.FAILURE_WINDOW_MS + 1);

        expect(getCircuitBreakerStats().get(ENDPOINT)?.failures).toBe(1);
    });

    it('bounds half-open probes and requires the configured success threshold', () => {
        for (let failure = 0; failure < CIRCUIT_BREAKER.FAILURE_THRESHOLD; failure += 1) {
            recordCircuitFailure(requirePermit(1_000 + failure), 1_000 + failure);
        }
        expect(acquireCircuitPermit(ENDPOINT, 2_000)).toBeNull();

        const resetAt = 1_000 + CIRCUIT_BREAKER.FAILURE_THRESHOLD - 1 +
            CIRCUIT_BREAKER.RESET_TIMEOUT_MS;
        const probes = Array.from(
            { length: CIRCUIT_BREAKER.SUCCESS_THRESHOLD },
            () => requirePermit(resetAt),
        );
        expect(acquireCircuitPermit(ENDPOINT, resetAt)).toBeNull();

        for (const probe of probes.slice(0, -1)) {
            recordCircuitSuccess(probe, resetAt + 1);
        }
        expect(getCircuitBreakerStats().get(ENDPOINT)?.state).toBe(CircuitState.HALF_OPEN);

        recordCircuitSuccess(probes.at(-1)!, resetAt + 1);
        expect(getCircuitBreakerStats().get(ENDPOINT)?.state).toBe(CircuitState.CLOSED);
    });

    it('ignores stale half-open successes after any probe fails', () => {
        for (let failure = 0; failure < CIRCUIT_BREAKER.FAILURE_THRESHOLD; failure += 1) {
            recordCircuitFailure(requirePermit(1_000 + failure), 1_000 + failure);
        }
        const resetAt = 1_000 + CIRCUIT_BREAKER.FAILURE_THRESHOLD - 1 +
            CIRCUIT_BREAKER.RESET_TIMEOUT_MS;
        const failedProbe = requirePermit(resetAt);
        const staleProbe = requirePermit(resetAt);

        recordCircuitFailure(failedProbe, resetAt + 1);
        recordCircuitSuccess(staleProbe, resetAt + 2);

        expect(getCircuitBreakerStats().get(ENDPOINT)?.state).toBe(CircuitState.OPEN);
    });

    it('keeps the state map within its configured bound', () => {
        for (let index = 0; index <= CIRCUIT_BREAKER.MAX_CIRCUITS; index += 1) {
            acquireCircuitPermit(`https://endpoint-${index}.example`, 1_000 + index);
        }

        expect(getCircuitBreakerStats().size).toBe(CIRCUIT_BREAKER.MAX_CIRCUITS);
    });

    it('ignores in-flight results from before a state reset', () => {
        const stalePermit = requirePermit(1_000);
        resetAllCircuitBreakers();
        requirePermit(1_001);

        recordCircuitFailure(stalePermit, 1_002);

        expect(getCircuitBreakerStats().get(ENDPOINT)?.failures).toBe(0);
    });

    it('isolates failures for the same endpoint by runtime state key', () => {
        const firstStateKey = 'channel-a-credential';
        const secondStateKey = 'channel-b-credential';
        for (let failure = 0; failure < CIRCUIT_BREAKER.FAILURE_THRESHOLD; failure += 1) {
            const permit = acquireCircuitPermit(
                ENDPOINT,
                1_000 + failure,
                firstStateKey,
            );
            expect(permit).not.toBeNull();
            recordCircuitFailure(permit!, 1_000 + failure);
        }

        expect(acquireCircuitPermit(ENDPOINT, 2_000, firstStateKey)).toBeNull();
        expect(acquireCircuitPermit(ENDPOINT, 2_000, secondStateKey)).not.toBeNull();
        expect(getCircuitBreakerStats().get(firstStateKey)?.state).toBe(CircuitState.OPEN);
        expect(getCircuitBreakerStats().get(secondStateKey)?.state).toBe(CircuitState.CLOSED);
    });
});
