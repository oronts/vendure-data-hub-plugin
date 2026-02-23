import { useMemo } from 'react';
import { Play, type LucideIcon } from 'lucide-react';
import type { TriggerType } from '../../shared/types';
import { useTriggerTypeSchemas, type TypedOptionValue, type ConfigOptionValue } from './api/use-config-options';
import { resolveIconName } from '../utils/icon-resolver';

export interface TriggerTypeConfig {
    readonly type: TriggerType;
    readonly label: string;
    readonly description: string;
    readonly icon: string;
}

export interface WizardTriggerOption {
    readonly id: string;
    readonly label: string;
    readonly desc: string;
}

function toTriggerTypeConfig(opt: ConfigOptionValue | TypedOptionValue): TriggerTypeConfig {
    return {
        type: opt.value as TriggerType,
        label: opt.label,
        description: opt.description ?? '',
        icon: opt.icon ?? 'play',
    };
}

function toWizardOption(opt: ConfigOptionValue | TypedOptionValue): WizardTriggerOption {
    return {
        id: opt.value,
        label: opt.label,
        desc: opt.description ?? '',
    };
}

/**
 * Provides trigger type metadata from the backend.
 * Replaces the hardcoded TRIGGER_TYPE_CONFIGS, TRIGGER_ICONS,
 * IMPORT_WIZARD_TRIGGERS, and EXPORT_WIZARD_TRIGGERS constants.
 *
 * Trigger wizard scoping is now driven by backend `wizardScopes` metadata
 * instead of hardcoded Sets.
 */
export function useTriggerTypes() {
    const { schemas: triggerSchemas, isLoading } = useTriggerTypeSchemas();

    const configs = useMemo(() => {
        const map: Partial<Record<TriggerType, TriggerTypeConfig>> = {};
        for (const schema of triggerSchemas) {
            map[schema.value as TriggerType] = toTriggerTypeConfig(schema);
        }
        return map as Record<TriggerType, TriggerTypeConfig>;
    }, [triggerSchemas]);

    const configList = useMemo(
        () => triggerSchemas.map(toTriggerTypeConfig),
        [triggerSchemas],
    );

    const importWizardTriggers = useMemo(
        () => triggerSchemas
            .filter(schema => schema.wizardScopes?.includes('import'))
            .map(toWizardOption),
        [triggerSchemas],
    );

    const exportWizardTriggers = useMemo(
        () => triggerSchemas
            .filter(schema => schema.wizardScopes?.includes('export'))
            .map(toWizardOption),
        [triggerSchemas],
    );

    return {
        /** Record<TriggerType, TriggerTypeConfig> for keyed access. */
        configs,
        /** Flat list of all trigger type configs. */
        configList,
        /** Filtered trigger options for import wizard. */
        importWizardTriggers,
        /** Filtered trigger options for export wizard. */
        exportWizardTriggers,
        /** Raw trigger type schemas for schema-driven rendering */
        triggerSchemas,
        isLoading,
    };
}

/**
 * Returns a function that resolves a trigger type string to a LucideIcon.
 * Useful for map/list rendering where a hook cannot be called per item.
 */
export function useTriggerIconResolver(): (triggerType: TriggerType) => LucideIcon {
    const { configs } = useTriggerTypes();
    return useMemo(
        () => (triggerType: TriggerType) => resolveIconName(configs[triggerType]?.icon) ?? Play,
        [configs],
    );
}
