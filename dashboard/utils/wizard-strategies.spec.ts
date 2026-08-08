import { describe, expect, it } from 'vitest';
import {
    isImportExistingRecordStrategy,
    normalizeWizardStrategyMappings,
} from './wizard-strategies';

describe('wizard strategy mappings', () => {
    it('returns exactly the four safe existing-record strategies in stable order', () => {
        const mappings = normalizeWizardStrategyMappings([
            {
                wizardValue: 'UPDATE',
                label: 'Merge existing record',
                loadStrategy: 'UPSERT',
                conflictStrategy: 'MERGE',
            },
            {
                wizardValue: 'HARD_DELETE',
                label: 'Delete record',
                loadStrategy: 'HARD_DELETE',
                conflictStrategy: 'SOURCE_WINS',
            },
        ]);

        expect(mappings.map(mapping => mapping.wizardValue)).toEqual([
            'SKIP',
            'UPDATE',
            'REPLACE',
            'ERROR',
        ]);
        expect(mappings.find(mapping => mapping.wizardValue === 'UPDATE')?.label)
            .toBe('Merge existing record');
        expect(mappings).not.toContainEqual(expect.objectContaining({
            wizardValue: 'HARD_DELETE',
        }));
    });

    it('rejects direct load and delete strategies as wizard values', () => {
        expect(isImportExistingRecordStrategy('SKIP')).toBe(true);
        expect(isImportExistingRecordStrategy('UPSERT')).toBe(false);
        expect(isImportExistingRecordStrategy('HARD_DELETE')).toBe(false);
    });

    it('localizes only fallback labels while preserving backend labels', () => {
        const mappings = normalizeWizardStrategyMappings([
            {
                wizardValue: 'UPDATE',
                label: 'Backend label',
                loadStrategy: 'UPSERT',
                conflictStrategy: 'MERGE',
            },
        ], id => ({
            'sharedUi.strategy.skip': 'Vorhandene überspringen',
            'sharedUi.strategy.update': 'Vorhandene aktualisieren',
            'sharedUi.strategy.replace': 'Vorhandene ersetzen',
            'sharedUi.strategy.error': 'Fehler bei vorhandenen',
        }[id] ?? id));

        expect(mappings.find(mapping => mapping.wizardValue === 'SKIP')?.label)
            .toBe('Vorhandene überspringen');
        expect(mappings.find(mapping => mapping.wizardValue === 'UPDATE')?.label)
            .toBe('Backend label');
    });
});
