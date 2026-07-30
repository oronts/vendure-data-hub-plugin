/**
 * Template Step Component
 *
 * First step in the import wizard that allows users to either:
 * 1. Select a pre-built template to start with
 * 2. Start from scratch with a blank configuration
 */

import * as React from 'react';
import { memo } from 'react';
import { Trans, useLingui } from '@lingui/react/macro';
import { FileCode, Sparkles } from 'lucide-react';
import { Button } from '@vendure/dashboard';
import { getErrorMessage } from '../../../../shared';
import { ErrorState, LoadingState } from '../../shared';
import { TemplateGallery } from '../../templates';
import { TemplatePreview } from '../../templates';
import type { ImportTemplate } from '../../../hooks/use-import-templates';
import type { TemplateCategory } from '../../../types';

interface CategoryInfo {
    category: TemplateCategory;
    label: string;
    description: string;
    icon: string;
    count: number;
}

export interface TemplateStepProps {
    templates: ImportTemplate[];
    categories: CategoryInfo[];
    isLoading: boolean;
    isError: boolean;
    error: unknown;
    onRetry: () => void;
    selectedTemplate: ImportTemplate | null;
    onSelectTemplate: (template: ImportTemplate | null) => void;
    onUseTemplate: (template: ImportTemplate) => void;
    onStartFromScratch: () => void;
}

function TemplateStepComponent({
    templates,
    categories,
    isLoading,
    isError,
    error,
    onRetry,
    selectedTemplate,
    onSelectTemplate,
    onUseTemplate,
    onStartFromScratch,
}: TemplateStepProps) {
    const { t } = useLingui();
    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-lg font-semibold"><Trans>Choose a template</Trans></h2>
                <p className="text-sm text-muted-foreground mt-1">
                    <Trans>Start with a pre-built template or create a custom import.</Trans>
                </p>
            </div>

            <div className="flex flex-col gap-4 p-4 border rounded-lg bg-muted/30 sm:flex-row sm:items-center">
                <div className="self-start p-3 bg-background rounded-lg border sm:self-center">
                    <FileCode className="h-6 w-6 text-muted-foreground" />
                </div>
                <div className="min-w-0 flex-1">
                    <h3 className="font-medium"><Trans>Start from scratch</Trans></h3>
                    <p className="text-sm text-muted-foreground">
                        <Trans>Build a custom import configuration step by step.</Trans>
                    </p>
                </div>
                <Button
                    className="w-full sm:w-auto sm:shrink-0"
                    variant="outline"
                    onClick={onStartFromScratch}
                >
                    <Trans>Create custom import</Trans>
                </Button>
            </div>

            <div className="relative">
                <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-background px-2 text-muted-foreground">
                        <Trans>Or choose a template</Trans>
                    </span>
                </div>
            </div>

            {isLoading ? (
                <LoadingState
                    message={t`Loading import configuration...`}
                />
            ) : isError ? (
                <ErrorState
                    title={t`Import configuration unavailable`}
                    message={t`Choose a template: ${getErrorMessage(error)}`}
                    error={error instanceof Error ? error : undefined}
                    onRetry={onRetry}
                />
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="lg:col-span-2">
                        <TemplateGallery
                            templates={templates}
                            categories={categories}
                            selectedTemplate={selectedTemplate}
                            onSelectTemplate={onSelectTemplate}
                        />
                    </div>

                    <div className="lg:col-span-1">
                        {selectedTemplate ? (
                            <TemplatePreview
                                template={selectedTemplate}
                                onUseTemplate={() => onUseTemplate(selectedTemplate)}
                            />
                        ) : (
                            <div className="border rounded-lg p-6 text-center bg-muted/20 h-full flex flex-col items-center justify-center">
                                <Sparkles className="h-12 w-12 text-muted-foreground/50 mb-4" />
                                <h3 className="font-medium"><Trans>Select a template</Trans></h3>
                                <p className="text-sm text-muted-foreground mt-1">
                                    <Trans>Choose a template to preview its configuration.</Trans>
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

export const TemplateStep = memo(TemplateStepComponent);
