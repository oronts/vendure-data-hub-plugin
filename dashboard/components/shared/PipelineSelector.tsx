import * as React from 'react';
import { useLingui } from '@lingui/react/macro';
import { usePermissions } from '@vendure/dashboard';
import { DATAHUB_PERMISSIONS, DEBOUNCE_DELAYS } from '../../constants';
import { useInfinitePipelines, usePipeline } from '../../hooks/api';
import { useDebouncedValue } from '../../hooks/use-debounced-value';
import { createPipelineSearchOptions } from '../../utils/pipeline-list-options';
import {
    SearchableReferenceSelector,
    type SearchableSelectorOption,
} from './SearchableReferenceSelector';

export interface PipelineSelectorOption {
    value: string;
    label: string;
}

export interface PipelineSelectorProps {
    id?: string;
    value: string;
    onValueChange: (value: string) => void;
    placeholder?: string;
    allOption?: PipelineSelectorOption;
    disabled?: boolean;
    className?: string;
    'data-testid'?: string;
    'aria-label'?: string;
    'aria-labelledby'?: string;
    'aria-describedby'?: string;
}

export function PipelineSelector({
    id,
    value,
    onValueChange,
    placeholder,
    allOption,
    disabled = false,
    className,
    'data-testid': testId,
    'aria-label': ariaLabel,
    'aria-labelledby': ariaLabelledBy,
    'aria-describedby': ariaDescribedBy,
}: PipelineSelectorProps) {
    const { t } = useLingui();
    const effectivePlaceholder = placeholder
        ?? t`Select pipeline...`;
    const [open, setOpen] = React.useState(false);
    const [searchTerm, setSearchTerm] = React.useState('');
    const { hasPermissions } = usePermissions();
    const canReadPipelines = hasPermissions([DATAHUB_PERMISSIONS.READ_PIPELINE]);
    const debouncedSearch = useDebouncedValue(searchTerm, DEBOUNCE_DELAYS.DEFAULT);
    const searchOptions = React.useMemo(
        () => createPipelineSearchOptions(debouncedSearch),
        [debouncedSearch],
    );
    const pipelinesQuery = useInfinitePipelines(searchOptions, open && canReadPipelines);
    const selectedPipelineId = value && value !== allOption?.value ? value : undefined;
    const selectedPipelineQuery = usePipeline(
        canReadPipelines ? selectedPipelineId : undefined,
    );
    const pipelines = React.useMemo(
        () => canReadPipelines
            ? pipelinesQuery.data?.pages.flatMap(page => page.items) ?? []
            : [],
        [canReadPipelines, pipelinesQuery.data?.pages],
    );
    const options: SearchableSelectorOption[] = pipelines.map(pipeline => ({
        value: String(pipeline.id),
        label: pipeline.name,
        description: pipeline.code,
    }));
    const selectedPipeline = canReadPipelines
        ? pipelines.find(pipeline => String(pipeline.id) === value)
            ?? selectedPipelineQuery.data
        : undefined;
    const totalItems = canReadPipelines
        ? pipelinesQuery.data?.pages[0]?.totalItems ?? 0
        : 0;

    const handleOpenChange = React.useCallback((nextOpen: boolean) => {
        setOpen(nextOpen);
        if (!nextOpen) setSearchTerm('');
    }, []);

    const handleValueChange = React.useCallback((nextValue: string) => {
        onValueChange(nextValue);
        setOpen(false);
        setSearchTerm('');
    }, [onValueChange]);

    return (
        <SearchableReferenceSelector
            id={id}
            value={value}
            selectedLabel={getSelectedLabel({
                value,
                placeholder: effectivePlaceholder,
                allOption,
                selectedPipeline,
                isLoading: canReadPipelines && selectedPipelineQuery.isLoading,
                isError: !canReadPipelines || selectedPipelineQuery.isError,
                loadingLabel: t`Loading selected pipeline...`,
                unavailableLabel: pipelineId => t`Unavailable pipeline (${pipelineId})`,
            })}
            options={options}
            searchTerm={searchTerm}
            onSearchTermChange={setSearchTerm}
            onValueChange={handleValueChange}
            open={open}
            onOpenChange={handleOpenChange}
            placeholder={effectivePlaceholder}
            searchPlaceholder={t`Search pipelines...`}
            emptyMessage={t`No pipelines found.`}
            errorMessage={canReadPipelines
                ? t`Could not load pipelines.`
                : t`You do not have permission to list Data Hub pipelines.`}
            allOption={allOption}
            disabled={disabled}
            className={className}
            isLoading={canReadPipelines && pipelinesQuery.isLoading}
            isError={!canReadPipelines || pipelinesQuery.isError}
            onRetry={canReadPipelines ? () => void pipelinesQuery.refetch() : undefined}
            hasNextPage={canReadPipelines && pipelinesQuery.hasNextPage}
            isFetchingNextPage={
                canReadPipelines && pipelinesQuery.isFetchingNextPage
            }
            remaining={Math.max(0, totalItems - pipelines.length)}
            onLoadMore={() => {
                if (canReadPipelines) void pipelinesQuery.fetchNextPage();
            }}
            data-testid={testId}
            aria-label={ariaLabel}
            aria-labelledby={ariaLabelledBy}
            aria-describedby={ariaDescribedBy}
        />
    );
}

interface SelectedLabelInput {
    value: string;
    placeholder: string;
    allOption?: PipelineSelectorOption;
    selectedPipeline?: { name: string; code: string } | null;
    isLoading: boolean;
    isError: boolean;
    loadingLabel: string;
    unavailableLabel: (pipelineId: string) => string;
}

function getSelectedLabel(input: SelectedLabelInput): string {
    if (input.value === input.allOption?.value) return input.allOption.label;
    if (input.selectedPipeline) {
        return `${input.selectedPipeline.name} (${input.selectedPipeline.code})`;
    }
    if (input.isLoading && input.value) return input.loadingLabel;
    if (input.isError && input.value) return input.unavailableLabel(input.value);
    return input.value || input.placeholder;
}
