import * as React from 'react';
import { useCallback, memo, useMemo } from 'react';
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
} from '@vendure/dashboard';
import { FolderOpen } from 'lucide-react';
import { useSecrets } from '../../../hooks/api';
import { useOptionValues, useDestinationSchemas, type ConfigOptionValue, type DestinationSchema, type ConnectionSchemaField } from '../../../hooks/api/use-config-options';
import { resolveIconName } from '../../../utils';
import { WizardStepContainer } from '../shared';
import { SelectableCard, SelectableCardGrid } from '../../shared/selectable-card';
import { SchemaFormRenderer } from '../../shared/schema-form';
import { STEP_CONTENT } from './constants';
import type { ExportConfiguration, DestinationType } from './types';
import type { AdapterSchema, AdapterSchemaField, SchemaFieldType } from '../../../../shared/types';

interface DestinationStepProps {
    config: Partial<ExportConfiguration>;
    updateConfig: (updates: Partial<ExportConfiguration>) => void;
    errors?: Record<string, string>;
}

export function DestinationStep({ config, updateConfig, errors = {} }: DestinationStepProps) {
    const destination = config.destination ?? { type: 'FILE' };

    const { data: secretsData } = useSecrets();
    const secretCodes = useMemo(
        () => (secretsData?.items ?? []).map(s => s.code),
        [secretsData],
    );

    const { options: destinationTypeOptions } = useOptionValues('destinationTypes');
    const { schemas: destinationSchemas } = useDestinationSchemas();

    return (
        <WizardStepContainer
            title={STEP_CONTENT.destination.title}
            description={STEP_CONTENT.destination.description}
        >
            <DestinationTypeSelection destination={destination} updateConfig={updateConfig} options={destinationTypeOptions} />

            <DestinationConfigPanel
                destination={destination}
                updateConfig={updateConfig}
                secretCodes={secretCodes}
                schemas={destinationSchemas}
            />
        </WizardStepContainer>
    );
}

interface DestinationConfigPanelProps {
    destination: ExportConfiguration['destination'];
    updateConfig: (updates: Partial<ExportConfiguration>) => void;
    secretCodes: string[];
    schemas: DestinationSchema[];
}

function DestinationConfigPanel({
    destination,
    updateConfig,
    secretCodes,
    schemas,
}: DestinationConfigPanelProps) {
    const schema = schemas.find(s => s.type === destination.type);

    // DOWNLOAD: static message, no form
    if (schema?.message) {
        return (
            <div className="p-4 rounded-lg bg-muted/50 text-sm text-muted-foreground">
                <p>{schema.message}</p>
            </div>
        );
    }

    // Schema found with fields: render schema-driven editor
    if (schema && schema.fields.length > 0) {
        return (
            <SchemaDestinationEditor
                schema={schema}
                destination={destination}
                updateConfig={updateConfig}
                secretCodes={secretCodes}
            />
        );
    }

    // No schema found: generic fallback
    return <GenericDestinationConfig destinationType={destination.type} />;
}

interface DestinationTypeSelectionProps {
    destination: ExportConfiguration['destination'];
    updateConfig: (updates: Partial<ExportConfiguration>) => void;
    options: ConfigOptionValue[];
}

function DestinationTypeSelection({ destination, updateConfig, options }: DestinationTypeSelectionProps) {
    return (
        <SelectableCardGrid columns={3}>
            {options.map(type => (
                <DestinationTypeCard
                    key={type.value}
                    type={type}
                    destination={destination}
                    updateConfig={updateConfig}
                />
            ))}
        </SelectableCardGrid>
    );
}

interface DestinationTypeCardProps {
    type: ConfigOptionValue;
    destination: ExportConfiguration['destination'];
    updateConfig: (updates: Partial<ExportConfiguration>) => void;
}

const DestinationTypeCard = memo(function DestinationTypeCard({
    type,
    destination,
    updateConfig,
}: DestinationTypeCardProps) {
    const handleClick = useCallback(() => {
        updateConfig({ destination: { type: type.value as DestinationType } });
    }, [type.value, updateConfig]);

    return (
        <SelectableCard
            icon={resolveIconName(type.icon) ?? FolderOpen}
            title={type.label}
            selected={destination.type === type.value}
            onClick={handleClick}
            data-testid={`datahub-export-destination-${type.value}-btn`}
        />
    );
});

// --- Schema-driven destination editor using SchemaFormRenderer ---

/** Convert ConnectionSchemaField[] to AdapterSchema for SchemaFormRenderer. */
function toAdapterSchema(fields: ConnectionSchemaField[]): AdapterSchema {
    return {
        fields: fields.map((f): AdapterSchemaField => ({
            key: f.key,
            label: f.label,
            description: f.description ?? undefined,
            type: (f.type || 'string') as SchemaFieldType,
            required: f.required ?? undefined,
            default: f.defaultValue,
            placeholder: f.placeholder ?? undefined,
            options: f.options?.map(o => ({ value: o.value, label: o.label })),
        })),
    };
}

interface SchemaDestinationEditorProps {
    schema: DestinationSchema;
    destination: ExportConfiguration['destination'];
    updateConfig: (updates: Partial<ExportConfiguration>) => void;
    secretCodes: string[];
}

function SchemaDestinationEditor({ schema, destination, updateConfig, secretCodes }: SchemaDestinationEditorProps) {
    const configKey = schema.configKey as keyof typeof destination;
    const currentConfig = (destination[configKey] as Record<string, unknown> | undefined) ?? {};

    const adapterSchema = useMemo(() => toAdapterSchema(schema.fields), [schema.fields]);

    const handleChange = useCallback((values: Record<string, unknown>) => {
        updateConfig({
            destination: {
                ...destination,
                [configKey]: values,
            },
        });
    }, [destination, configKey, updateConfig]);

    return (
        <Card>
            <CardHeader>
                <CardTitle>{schema.label}</CardTitle>
            </CardHeader>
            <CardContent>
                <SchemaFormRenderer
                    schema={adapterSchema}
                    values={currentConfig}
                    onChange={handleChange}
                    secretCodes={secretCodes}
                />
            </CardContent>
        </Card>
    );
}

function GenericDestinationConfig({ destinationType }: { destinationType: string }) {
    return (
        <div className="p-4 rounded-lg bg-muted/50 text-sm text-muted-foreground">
            <p>
                No additional configuration is needed for the "{destinationType}" destination type.
            </p>
        </div>
    );
}
