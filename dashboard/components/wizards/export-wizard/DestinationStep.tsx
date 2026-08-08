import * as React from 'react';
import { useCallback, memo, useMemo } from 'react';
import { useLingui } from '@lingui/react/macro';
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
} from '@vendure/dashboard';
import { FolderOpen } from 'lucide-react';
import { useOptionValues, useDestinationSchemas, type ConfigOptionValue, type DestinationSchema } from '../../../hooks/api/use-config-options';
import { mapAdapterSchema, resolveIconName } from '../../../utils';
import { WizardStepContainer } from '../shared';
import { SelectableCard, SelectableCardGrid } from '../../shared/selectable-card';
import { SchemaFormRenderer } from '../../shared/schema-form';
import type { ExportConfiguration, DestinationType } from './types';

interface DestinationStepProps {
    config: Partial<ExportConfiguration>;
    updateConfig: (updates: Partial<ExportConfiguration>) => void;
}

export function DestinationStep({ config, updateConfig }: DestinationStepProps) {
    const { t } = useLingui();
    const destination = config.destination ?? { type: 'LOCAL' };

    const { options: destinationTypeOptions } = useOptionValues('destinationTypes');
    const { schemas: destinationSchemas } = useDestinationSchemas();

    return (
        <WizardStepContainer
            title={t`Destination`}
            description={t`Choose where to deliver the exported data`}
        >
            <DestinationTypeSelection destination={destination} updateConfig={updateConfig} options={destinationTypeOptions} />

            <DestinationConfigPanel
                destination={destination}
                updateConfig={updateConfig}
                schemas={destinationSchemas}
            />
        </WizardStepContainer>
    );
}

interface DestinationConfigPanelProps {
    destination: ExportConfiguration['destination'];
    updateConfig: (updates: Partial<ExportConfiguration>) => void;
    schemas: DestinationSchema[];
}

function DestinationConfigPanel({
    destination,
    updateConfig,
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
            />
        );
    }

    // The server only advertises destinations with executable schemas.
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

interface SchemaDestinationEditorProps {
    schema: DestinationSchema;
    destination: ExportConfiguration['destination'];
    updateConfig: (updates: Partial<ExportConfiguration>) => void;
}

function SchemaDestinationEditor({ schema, destination, updateConfig }: SchemaDestinationEditorProps) {
    const configKey = schema.configKey as keyof typeof destination;
    const currentConfig = (destination[configKey] as Record<string, unknown> | undefined) ?? {};

    const adapterSchema = useMemo(() => mapAdapterSchema({ fields: schema.fields }), [schema.fields]);

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
                />
            </CardContent>
        </Card>
    );
}

function GenericDestinationConfig({ destinationType }: { destinationType: string }) {
    const { t } = useLingui();
    return (
        <div className="p-4 rounded-lg bg-muted/50 text-sm text-muted-foreground">
            <p>
                {t`No configuration schema is available for the ${destinationType} destination.`}
            </p>
        </div>
    );
}
