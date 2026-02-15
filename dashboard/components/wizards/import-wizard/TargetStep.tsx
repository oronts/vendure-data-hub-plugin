import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    CardDescription,
    Badge,
} from '@vendure/dashboard';
import { VENDURE_ENTITY_LIST } from '../../../../shared';
import type { EnhancedFieldDefinition } from '../../../types';
import { WizardStepContainer } from '../shared';
import { EntitySelector } from '../../shared/entity-selector';
import { STEP_CONTENT } from './Constants';
import type { ImportConfiguration } from './Types';

interface TargetStepProps {
    config: Partial<ImportConfiguration>;
    updateConfig: (updates: Partial<ImportConfiguration>) => void;
    errors?: Record<string, string>;
}

export function TargetStep({ config, updateConfig, errors = {} }: TargetStepProps) {
    return (
        <WizardStepContainer
            title={STEP_CONTENT.target.title}
            description={STEP_CONTENT.target.description}
        >
            <EntitySelector
                value={config.targetEntity}
                onChange={(entityCode) => updateConfig({ targetEntity: entityCode })}
            />

            {config.targetEntity && config.targetSchema && (
                <SchemaFieldsCard config={config} />
            )}
        </WizardStepContainer>
    );
}

interface SchemaFieldsCardProps {
    config: Partial<ImportConfiguration>;
}

function SchemaFieldsCard({ config }: SchemaFieldsCardProps) {
    const entityName = VENDURE_ENTITY_LIST.find(e => e.code === config.targetEntity)?.name;

    if (!config.targetSchema) {
        return null;
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle>Schema Fields</CardTitle>
                <CardDescription>
                    Available fields for {entityName}
                </CardDescription>
            </CardHeader>
            <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                    {Object.entries(config.targetSchema.fields).map(([name, field]) => (
                        <div
                            key={name}
                            className="flex items-center gap-2 p-2 rounded bg-muted/50"
                        >
                            <span className="font-mono text-sm">{name}</span>
                            {(field as EnhancedFieldDefinition).required && (
                                <Badge variant="destructive" className="text-[10px] px-1">req</Badge>
                            )}
                        </div>
                    ))}
                </div>
            </CardContent>
        </Card>
    );
}
