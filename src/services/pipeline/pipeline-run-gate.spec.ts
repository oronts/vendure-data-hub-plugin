import { describe, expect, it } from 'vitest';
import { GATE_LIMITS, TIME } from '../../constants';
import type { PipelineDefinition, PipelineMetrics } from '../../types';
import { getPausedGateMetadata } from './pipeline-run-gate';

function definitionWithGates(
    ...gates: Array<{ key: string; config: Record<string, unknown> }>
): PipelineDefinition {
    return {
        version: 1,
        steps: gates.map(gate => ({
            key: gate.key,
            type: 'GATE',
            config: gate.config,
        })),
    } as PipelineDefinition;
}

function pausedAt(stepKey: string): PipelineMetrics {
    return { pausedAtStep: stepKey } as PipelineMetrics;
}

describe('getPausedGateMetadata', () => {
    it('computes the selected TIMEOUT gate deadline from durable pause time', () => {
        const now = new Date('2026-07-22T10:00:00.000Z');

        const metadata = getPausedGateMetadata(
            pausedAt('approval'),
            definitionWithGates({
                key: 'approval',
                config: { approvalType: 'TIMEOUT', timeoutSeconds: 30 },
            }),
            now,
        );

        expect(metadata).toEqual({
            stepKey: 'approval',
            timeoutAt: new Date(now.getTime() + 30 * TIME.SECOND),
        });
    });

    it('persists only the gate selected by pausedAtStep', () => {
        const metadata = getPausedGateMetadata(
            pausedAt('second-gate'),
            definitionWithGates(
                {
                    key: 'first-gate',
                    config: { approvalType: 'TIMEOUT', timeoutSeconds: 10 },
                },
                {
                    key: 'second-gate',
                    config: { approvalType: 'TIMEOUT', timeoutSeconds: 20 },
                },
            ),
            new Date('2026-07-22T10:00:00.000Z'),
        );

        expect(metadata?.stepKey).toBe('second-gate');
        expect(metadata?.timeoutAt?.toISOString()).toBe('2026-07-22T10:00:20.000Z');
    });

    it('keeps manual gates actionable without scheduling a deadline', () => {
        expect(getPausedGateMetadata(
            pausedAt('approval'),
            definitionWithGates({
                key: 'approval',
                config: { approvalType: 'MANUAL' },
            }),
        )).toEqual({ stepKey: 'approval', timeoutAt: null });
    });

    it.each([
        0,
        1.5,
        GATE_LIMITS.MAX_TIMEOUT_SECONDS + 1,
        '30',
    ])('fails safe for invalid runtime timeout %s', timeoutSeconds => {
        expect(getPausedGateMetadata(
            pausedAt('approval'),
            definitionWithGates({
                key: 'approval',
                config: { approvalType: 'TIMEOUT', timeoutSeconds },
            }),
        )).toEqual({ stepKey: 'approval', timeoutAt: null });
    });

    it('rejects missing and non-gate paused steps', () => {
        const definition = {
            version: 1,
            steps: [{ key: 'transform', type: 'TRANSFORM', config: {} }],
        } as PipelineDefinition;

        expect(getPausedGateMetadata(pausedAt('missing'), definition)).toBeNull();
        expect(getPausedGateMetadata(pausedAt('transform'), definition)).toBeNull();
    });
});
