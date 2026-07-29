import * as React from 'react';
import { useLingui } from '@lingui/react/macro';
import { BoxSelect, Database } from 'lucide-react';
import { WizardStepContainer, SOURCE_TYPE } from '../shared';
import { SelectableCard, SelectableCardGrid } from '../../shared/selectable-card';
import { useAdaptersByType } from '../../../hooks/api/use-adapters';
import type {
    ImportConfiguration,
    SourceType,
} from './types';
import { isImportSourceAvailable } from './source-config';
import { SourceAdapterConfig } from './SourceAdapterConfig';
import { SourceApiConfig } from './SourceApiConfig';
import { SourceFileConfig } from './SourceFileConfig';
import {
    getAdapterCodeForSourceType,
    getDynamicSourceOptions,
    resolveSourceIcon,
    SMART_SOURCE_ICONS,
    SMART_SOURCES,
} from './source-options';

const LOADING_CARD_COUNT = 6;

interface SourceStepProps {
    config: Partial<ImportConfiguration>;
    updateConfig: (updates: Partial<ImportConfiguration>) => void;
    uploadedFile: File | null;
    setUploadedFile: (file: File | null) => void;
    isParsing: boolean;
    errors?: Record<string, string>;
    canManageFiles: boolean;
}

export function SourceStep({
    config,
    updateConfig,
    uploadedFile,
    setUploadedFile,
    isParsing,
    errors = {},
    canManageFiles,
}: SourceStepProps) {
    const { t } = useLingui();
    const {
        data: extractors,
        isLoading: isLoadingExtractors,
    } = useAdaptersByType('EXTRACTOR');
    const smartSources = React.useMemo(
        () => SMART_SOURCES.filter(source =>
            isImportSourceAvailable(source.id, canManageFiles)),
        [canManageFiles],
    );
    const dynamicSources = React.useMemo(
        () => getDynamicSourceOptions(extractors),
        [extractors],
    );
    const localizedSmartSources = smartSources.map(source => ({
        ...source,
        label: source.id === SOURCE_TYPE.FILE ? t`File upload` : t`REST API`,
        description: source.id === SOURCE_TYPE.FILE
            ? t`CSV, Excel, JSON, or XML`
            : t`Fetch data from an HTTP endpoint`,
        iconName: undefined as string | undefined,
    }));
    const allSources = [...localizedSmartSources, ...dynamicSources];
    const schemaSourceType = config.source?.type;
    const isSchemaSource = schemaSourceType
        && schemaSourceType !== SOURCE_TYPE.FILE
        && schemaSourceType !== SOURCE_TYPE.API;

    return (
        <WizardStepContainer
            title={t`Choose a source`}
            description={t`Select where the import data comes from.`}
        >
            {isLoadingExtractors ? (
                <SelectableCardGrid columns={4}>
                    {localizedSmartSources.map(source => (
                        <SelectableCard
                            key={source.id}
                            icon={SMART_SOURCE_ICONS[source.id] ?? Database}
                            title={source.label}
                            description={source.description}
                            selected={config.source?.type === source.id}
                            onClick={() => updateConfig({
                                source: { type: source.id as SourceType },
                            })}
                        />
                    ))}
                    {Array.from({ length: LOADING_CARD_COUNT }, (_, index) => (
                        <div
                            key={`loading-${index}`}
                            className="p-4 border rounded-lg animate-pulse"
                        >
                            <div className="w-8 h-8 bg-muted rounded mb-2" />
                            <div className="h-4 bg-muted rounded w-3/4 mb-1" />
                            <div className="h-3 bg-muted rounded w-full" />
                        </div>
                    ))}
                </SelectableCardGrid>
            ) : (
                <SelectableCardGrid columns={4}>
                    {allSources.map(source => (
                        <SelectableCard
                            key={source.id}
                            icon={resolveSourceIcon(
                                source.id,
                                source.iconName,
                                BoxSelect,
                            )}
                            title={source.label}
                            description={source.description}
                            selected={config.source?.type === source.id}
                            onClick={() => updateConfig({
                                source: { type: source.id as SourceType },
                            })}
                        />
                    ))}
                </SelectableCardGrid>
            )}

            {canManageFiles && config.source?.type === SOURCE_TYPE.FILE && (
                <SourceFileConfig
                    config={config}
                    updateConfig={updateConfig}
                    uploadedFile={uploadedFile}
                    setUploadedFile={setUploadedFile}
                    isParsing={isParsing}
                />
            )}

            {config.source?.type === SOURCE_TYPE.API && (
                <SourceApiConfig
                    config={config}
                    updateConfig={updateConfig}
                />
            )}

            {isSchemaSource && schemaSourceType && (
                <SourceAdapterConfig
                    adapterCode={getAdapterCodeForSourceType(
                        schemaSourceType,
                        extractors,
                    )}
                    config={config}
                    updateConfig={updateConfig}
                    configKey={`${schemaSourceType.toLowerCase()}Config`}
                    errors={errors}
                />
            )}
        </WizardStepContainer>
    );
}
