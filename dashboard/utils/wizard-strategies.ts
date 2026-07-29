import {
    IMPORT_EXISTING_RECORD_STRATEGIES,
    type ImportExistingRecordStrategy,
    type WizardStrategyMapping,
} from '../types/wizard';
import { SHARED_UI_TRANSLATION_IDS } from '../constants/shared-ui-labels';

type StrategyTranslate = (id: string) => string;

function createDefaultWizardStrategyMappings(translate?: StrategyTranslate): Record<
    ImportExistingRecordStrategy,
    WizardStrategyMapping
> {
    const label = (id: string, fallback: string) => translate?.(id) ?? fallback;
    return {
        SKIP: {
            wizardValue: 'SKIP',
            label: label(SHARED_UI_TRANSLATION_IDS.STRATEGY_SKIP, 'Skip existing'),
            loadStrategy: 'CREATE',
            conflictStrategy: 'SOURCE_WINS',
        },
        UPDATE: {
            wizardValue: 'UPDATE',
            label: label(SHARED_UI_TRANSLATION_IDS.STRATEGY_UPDATE, 'Update existing'),
            loadStrategy: 'UPSERT',
            conflictStrategy: 'MERGE',
        },
        REPLACE: {
            wizardValue: 'REPLACE',
            label: label(SHARED_UI_TRANSLATION_IDS.STRATEGY_REPLACE, 'Replace existing'),
            loadStrategy: 'UPSERT',
            conflictStrategy: 'SOURCE_WINS',
        },
        ERROR: {
            wizardValue: 'ERROR',
            label: label(SHARED_UI_TRANSLATION_IDS.STRATEGY_ERROR, 'Error on existing'),
            loadStrategy: 'CREATE',
            conflictStrategy: 'SOURCE_WINS',
        },
    };
}

export function isImportExistingRecordStrategy(
    value: unknown,
): value is ImportExistingRecordStrategy {
    return typeof value === 'string'
        && IMPORT_EXISTING_RECORD_STRATEGIES.some(strategy => strategy === value);
}

export function normalizeWizardStrategyMappings(
    mappings: readonly {
        wizardValue: string;
        label: string;
        loadStrategy: string;
        conflictStrategy: string;
    }[],
    translate?: StrategyTranslate,
): WizardStrategyMapping[] {
    const defaults = createDefaultWizardStrategyMappings(translate);
    const configured = new Map(
        mappings
            .filter(mapping => isImportExistingRecordStrategy(mapping.wizardValue))
            .map(mapping => [mapping.wizardValue, mapping]),
    );
    return IMPORT_EXISTING_RECORD_STRATEGIES.map(wizardValue => ({
        ...defaults[wizardValue],
        ...configured.get(wizardValue),
        wizardValue,
    }));
}
