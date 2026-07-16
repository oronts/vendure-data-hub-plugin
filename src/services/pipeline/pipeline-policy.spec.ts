import { describe, expect, it } from 'vitest';
import { PipelineStatus } from '../../constants/enums';
import { PipelineDefinition } from '../../types';
import {
    assertPipelineRunnable,
    assertPipelineStatus,
    assertValidPipelineCode,
    definitionsEqual,
    normalizePipelineDefinition,
    normalizePipelineVersion,
    statusAfterExecutableUpdate,
} from './pipeline-policy';

const definition: PipelineDefinition = {
    version: 1,
    steps: [],
};

describe('pipeline policy', () => {
    it('accepts a lowercase pipeline code', () => {
        expect(() => assertValidPipelineCode('catalog-sync-1')).not.toThrow();
    });

    it.each(['Catalog-Sync', 'catalog_sync', 'catalog sync', ''])(
        'rejects invalid pipeline code %s',
        code => {
            expect(() => assertValidPipelineCode(code)).toThrow(/Pipeline code/);
        },
    );

    it('normalizes a cloned definition without mutating the input', () => {
        const input = { ...definition, version: 2 };
        const result = normalizePipelineDefinition(input, 1);

        expect(result).toEqual(input);
        expect(result).not.toBe(input);
    });

    it.each([0, -1, 1.5, '1'])('rejects invalid version %s', value => {
        expect(() => normalizePipelineVersion(value, 1)).toThrow(/Pipeline version/);
    });

    it('uses the fallback only when a version is absent', () => {
        expect(normalizePipelineVersion(undefined, 3)).toBe(3);
    });

    it('compares definitions structurally', () => {
        expect(definitionsEqual(definition, { version: 1, steps: [] })).toBe(true);
        expect(definitionsEqual(definition, { version: 2, steps: [] })).toBe(false);
    });

    it.each([
        PipelineStatus.REVIEW,
        PipelineStatus.PUBLISHED,
        PipelineStatus.ARCHIVED,
    ])('moves %s to draft when executable content changes', status => {
        expect(statusAfterExecutableUpdate(status, true)).toBe(PipelineStatus.DRAFT);
    });

    it('keeps status when executable content is unchanged', () => {
        expect(statusAfterExecutableUpdate(PipelineStatus.PUBLISHED, false)).toBe(
            PipelineStatus.PUBLISHED,
        );
    });

    it('allows only an enabled published pipeline to run', () => {
        expect(() => assertPipelineRunnable({
            enabled: true,
            status: PipelineStatus.PUBLISHED,
        })).not.toThrow();
        expect(() => assertPipelineRunnable({
            enabled: true,
            status: PipelineStatus.DRAFT,
        })).toThrow(/Cannot run/);
        expect(() => assertPipelineRunnable({
            enabled: false,
            status: PipelineStatus.PUBLISHED,
        })).toThrow(/disabled/);
    });

    it('enforces explicit lifecycle transitions', () => {
        expect(() => assertPipelineStatus(
            PipelineStatus.REVIEW,
            [PipelineStatus.REVIEW],
            'approve',
        )).not.toThrow();
        expect(() => assertPipelineStatus(
            PipelineStatus.DRAFT,
            [PipelineStatus.REVIEW],
            'approve',
        )).toThrow(/Cannot approve/);
    });
});
