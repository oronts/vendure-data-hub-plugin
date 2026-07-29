import type { ComponentType } from 'react';

import { STEP_TYPE } from '../../../constants';
import type { StepType } from '../../../types';
import { EnrichConfigComponent } from './EnrichConfigComponent';
import { GateConfigComponent } from './GateConfigComponent';
import { RouteConfigComponent } from './RouteConfigComponent';
import { ValidateConfigComponent } from './ValidateConfigComponent';

export interface SpecialConfigEditorProps {
    readonly config: Record<string, unknown>;
    readonly onChange: (config: Record<string, unknown>) => void;
    readonly showErrorHandling?: boolean;
    readonly showRulesEditor?: boolean;
}

const SPECIAL_CONFIG_EDITORS: Partial<
    Record<StepType, ComponentType<SpecialConfigEditorProps>>
> = {
    [STEP_TYPE.ROUTE]: RouteConfigComponent as ComponentType<SpecialConfigEditorProps>,
    [STEP_TYPE.VALIDATE]: ValidateConfigComponent as ComponentType<SpecialConfigEditorProps>,
    [STEP_TYPE.ENRICH]: EnrichConfigComponent as ComponentType<SpecialConfigEditorProps>,
    [STEP_TYPE.GATE]: GateConfigComponent as ComponentType<SpecialConfigEditorProps>,
};

export function hasSpecialConfigEditor(stepType: StepType): boolean {
    return getSpecialConfigEditor(stepType) != null;
}

export function getSpecialConfigEditor(
    stepType: StepType,
): ComponentType<SpecialConfigEditorProps> | undefined {
    return SPECIAL_CONFIG_EDITORS[stepType];
}
