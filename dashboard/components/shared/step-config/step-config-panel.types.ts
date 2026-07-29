import type { AdapterMetadata } from '../../../hooks';
import type { StepContextOverride, StepType } from '../../../types';

export interface StepConfigData {
    key: string;
    type: StepType | string;
    config: Record<string, unknown>;
    adapterCode?: string;
    context?: StepContextOverride;
    schemaRef?: { schemaId: string; version: string };
}

export interface StepConfigPanelProps {
    data: StepConfigData;
    onChange: (data: StepConfigData) => void;
    onDelete?: () => void;
    catalog?: AdapterMetadata[];
    variant?: 'panel' | 'inline';
    showKeyInput?: boolean;
    showHeader?: boolean;
    showDeleteButton?: boolean;
    showCheatSheet?: boolean;
    showStepTester?: boolean;
    showAdvancedEditors?: boolean;
    compact?: boolean;
    errors?: Record<string, string>;
    catalogLoading?: boolean;
    catalogError?: Error | null;
}
