import * as React from 'react';
import { Trans } from '@lingui/react/macro';
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
} from '@vendure/dashboard';
import { useAdapterCatalog } from '../../../hooks/use-adapter-catalog';
import { SchemaFormRenderer } from '../../shared/schema-form/SchemaFormRenderer';
import type { ImportConfiguration } from './types';

interface SourceAdapterConfigProps {
    adapterCode: string;
    config: Partial<ImportConfiguration>;
    updateConfig: (updates: Partial<ImportConfiguration>) => void;
    configKey: string;
    errors?: Record<string, string>;
}

export function SourceAdapterConfig({
    adapterCode,
    config,
    updateConfig,
    configKey,
    errors = {},
}: SourceAdapterConfigProps) {
    const {
        adapters,
        isLoading,
        error,
    } = useAdapterCatalog();
    const adapter = React.useMemo(
        () => adapters.find(candidate =>
            candidate.type === 'EXTRACTOR'
            && candidate.code === adapterCode),
        [adapterCode, adapters],
    );
    const values = (
        (config.source as Record<string, unknown> | undefined)?.[configKey] ?? {}
    ) as Record<string, unknown>;
    const handleChange = React.useCallback(
        (newValues: Record<string, unknown>) => {
            updateConfig({
                source: {
                    ...config.source!,
                    [configKey]: newValues,
                },
            });
        },
        [config.source, configKey, updateConfig],
    );

    if (isLoading) {
        return (
            <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                    <Trans>Loading adapter configuration...</Trans>
                </CardContent>
            </Card>
        );
    }

    if (error || !adapter) {
        return (
            <Card>
                <CardContent className="py-8 text-center text-destructive">
                    <Trans>Adapter configuration could not be loaded. Reload the page to try again.</Trans>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle>{adapter.name ?? adapter.code}</CardTitle>
                {adapter.description && (
                    <p className="text-sm text-muted-foreground">
                        {adapter.description}
                    </p>
                )}
            </CardHeader>
            <CardContent>
                <SchemaFormRenderer
                    schema={adapter.schema}
                    values={values}
                    onChange={handleChange}
                    errors={errors}
                />
            </CardContent>
        </Card>
    );
}
