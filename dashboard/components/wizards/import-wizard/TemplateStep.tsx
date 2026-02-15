/**
 * Template Step Component
 *
 * First step in the import wizard that allows users to either:
 * 1. Select a pre-built template to start with
 * 2. Start from scratch with a blank configuration
 */

import * as React from 'react';
import { memo } from 'react';
import { FileCode, Sparkles } from 'lucide-react';
import { Button } from '@vendure/dashboard';
import { TemplateGallery } from '../../templates';
import { TemplatePreview } from '../../templates';
import { STEP_CONTENT } from './Constants';

type TemplateCategory = 'products' | 'customers' | 'inventory' | 'orders' | 'promotions' | 'catalog';
type TemplateDifficulty = 'beginner' | 'intermediate' | 'advanced';

interface ImportTemplate {
    id: string;
    name: string;
    description: string;
    category: TemplateCategory;
    icon?: string;
    difficulty: TemplateDifficulty;
    estimatedTime: string;
    requiredFields: string[];
    optionalFields: string[];
    sampleData?: Record<string, unknown>[];
    featured?: boolean;
    tags?: string[];
    formats?: string[];
    definition?: unknown;
}

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
    selectedTemplate: ImportTemplate | null;
    onSelectTemplate: (template: ImportTemplate | null) => void;
    onUseTemplate: (template: ImportTemplate) => void;
    onStartFromScratch: () => void;
}

function TemplateStepComponent({
    templates,
    categories,
    selectedTemplate,
    onSelectTemplate,
    onUseTemplate,
    onStartFromScratch,
}: TemplateStepProps) {
    return (
        <div className="space-y-6">
            {/* Header */}
            <div>
                <h2 className="text-lg font-semibold">{STEP_CONTENT.template?.title ?? 'Choose a Template'}</h2>
                <p className="text-sm text-muted-foreground mt-1">
                    {STEP_CONTENT.template?.description ?? 'Start with a pre-built template or create from scratch'}
                </p>
            </div>

            {/* Start from scratch option */}
            <div className="flex items-center gap-4 p-4 border rounded-lg bg-muted/30">
                <div className="p-3 bg-background rounded-lg border">
                    <FileCode className="h-6 w-6 text-muted-foreground" />
                </div>
                <div className="flex-1">
                    <h3 className="font-medium">Start from Scratch</h3>
                    <p className="text-sm text-muted-foreground">
                        Build your import configuration step by step with full customization
                    </p>
                </div>
                <Button variant="outline" onClick={onStartFromScratch}>
                    Create Custom Import
                </Button>
            </div>

            {/* Divider */}
            <div className="relative">
                <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-background px-2 text-muted-foreground">
                        Or choose a template
                    </span>
                </div>
            </div>

            {/* Main content area */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Template Gallery */}
                <div className="lg:col-span-2">
                    <TemplateGallery
                        templates={templates}
                        categories={categories}
                        selectedTemplate={selectedTemplate}
                        onSelectTemplate={onSelectTemplate}
                    />
                </div>

                {/* Template Preview / Placeholder */}
                <div className="lg:col-span-1">
                    {selectedTemplate ? (
                        <TemplatePreview
                            template={selectedTemplate}
                            onUseTemplate={() => onUseTemplate(selectedTemplate)}
                        />
                    ) : (
                        <div className="border rounded-lg p-6 text-center bg-muted/20 h-full flex flex-col items-center justify-center">
                            <Sparkles className="h-12 w-12 text-muted-foreground/50 mb-4" />
                            <h3 className="font-medium">Select a Template</h3>
                            <p className="text-sm text-muted-foreground mt-1">
                                Click on a template to see its details and sample data
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

export const TemplateStep = memo(TemplateStepComponent);
