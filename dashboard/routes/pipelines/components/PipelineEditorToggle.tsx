import * as React from 'react';
import { Trans } from '@lingui/react/macro';
import { Tabs, TabsList, TabsTrigger } from '@vendure/dashboard';
import { PipelineEditor } from '../../../components/pipelines/PipelineEditor';
import type {
    PipelineDefinition,
    VisualPipelineDefinition,
    ValidationIssue,
} from '../../../types';
import { toVisualDefinition, toCanonicalDefinition } from '../utils';
import {
    EDITOR_HEIGHTS,
} from '../../../constants';

const ReactFlowPipelineEditor = React.lazy(async () => {
    const module = await import(
        '../../../components/pipelines/ReactFlowPipelineEditor.js'
    );
    return { default: module.ReactFlowPipelineEditor };
});

export type EditorMode = 'simple' | 'visual';

export interface PipelineEditorToggleProps {
    definition: unknown;
    onChange: (definition: PipelineDefinition) => void;
    /** Validation issues to display in the editor */
    issues: ValidationIssue[];
    readOnly: boolean;
}

/**
 * Editor component with toggle between Simple (list-based) and Visual (ReactFlow) modes.
 * Converts between canonical and visual pipeline definitions on mode switch.
 */
export function PipelineEditorToggle({
    definition: rawDefinition,
    onChange,
    issues,
    readOnly,
}: Readonly<PipelineEditorToggleProps>) {
    const definition = rawDefinition as
        | PipelineDefinition
        | VisualPipelineDefinition
        | undefined;

    const [editorMode, setEditorMode] = React.useState<EditorMode>('simple');

    const visualDefinition = React.useMemo(() => {
        return toVisualDefinition(definition);
    }, [definition]);

    const canonicalDefinition = React.useMemo(() => {
        return toCanonicalDefinition(definition);
    }, [definition]);

    const handleVisualEditorChange = React.useCallback(
        (newDef: VisualPipelineDefinition) => {
            onChange(toCanonicalDefinition(newDef));
        },
        [onChange]
    );

    const handleSimpleEditorChange = React.useCallback(
        (newDef: PipelineDefinition) => {
            onChange(newDef);
        },
        [onChange]
    );

    const handleModeChange = React.useCallback((value: string) => {
        setEditorMode(value as EditorMode);
    }, []);

    // Convert issues to the format expected by the editor
    const formattedIssues = React.useMemo(() => {
        return issues.map((issue) => ({
            message: issue.message,
            stepKey: issue.stepKey ?? null,
            field: issue.field ?? null,
            reason: issue.reason ?? null,
        }));
    }, [issues]);

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                <label className="text-sm font-medium">
                    <Trans>Pipeline definition</Trans>
                </label>
                <Tabs value={editorMode} onValueChange={handleModeChange}>
                    <TabsList className="h-8">
                        <TabsTrigger value="simple" className="text-xs px-3">
                            <Trans>Simple</Trans>
                        </TabsTrigger>
                        <TabsTrigger value="visual" className="text-xs px-3">
                            <Trans>Workflow</Trans>
                        </TabsTrigger>
                    </TabsList>
                </Tabs>
            </div>

            <div
                className="border rounded-lg overflow-hidden"
                style={{ height: editorMode === 'visual' ? EDITOR_HEIGHTS.VISUAL : EDITOR_HEIGHTS.SIMPLE }}
            >
                {editorMode === 'visual' ? (
                    <React.Suspense
                        fallback={
                            <div className="p-4 text-sm text-muted-foreground">
                                <Trans>Loading visual editor...</Trans>
                            </div>
                        }
                    >
                        <ReactFlowPipelineEditor
                            definition={visualDefinition}
                            onChange={handleVisualEditorChange}
                            readOnly={readOnly}
                            issues={formattedIssues}
                        />
                    </React.Suspense>
                ) : (
                    <PipelineEditor
                        definition={canonicalDefinition}
                        onChange={handleSimpleEditorChange}
                        issues={formattedIssues}
                        readOnly={readOnly}
                    />
                )}
            </div>
        </div>
    );
}
