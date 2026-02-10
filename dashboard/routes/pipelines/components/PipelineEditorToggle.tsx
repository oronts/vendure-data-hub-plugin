import * as React from 'react';
import { Tabs, TabsList, TabsTrigger } from '@vendure/dashboard';
import { PipelineEditor } from '../../../components/pipelines/PipelineEditor';
import { ReactFlowPipelineEditor } from '../../../components/pipelines/ReactFlowPipelineEditor';
import type {
    PipelineDefinition,
    PipelineFormControl,
    VisualPipelineDefinition,
    ValidationIssue,
} from '../../../types';
import { toVisualDefinition, toCanonicalDefinition } from '../utils';
import { EDITOR_HEIGHTS } from '../../../constants';

export type EditorMode = 'simple' | 'visual';

export interface PipelineEditorToggleProps {
    /** The form control for the pipeline */
    form: PipelineFormControl;
    /** Validation issues to display in the editor */
    issues: ValidationIssue[];
}

/**
 * Editor component with toggle between Simple (list-based) and Visual (ReactFlow) modes.
 * Converts between canonical and visual pipeline definitions on mode switch.
 */
export function PipelineEditorToggle({
    form,
    issues,
}: Readonly<PipelineEditorToggleProps>) {
    const definition = form.watch('definition') as
        | PipelineDefinition
        | VisualPipelineDefinition
        | undefined;

    const [editorMode, setEditorMode] = React.useState<EditorMode>('simple');

    const visualDefinition = React.useMemo(() => {
        return toVisualDefinition(definition);
    }, [definition]);

    const handleVisualEditorChange = React.useCallback(
        (newDef: VisualPipelineDefinition) => {
            form.setValue('definition', toCanonicalDefinition(newDef), {
                shouldDirty: true,
            });
        },
        [form]
    );

    const handleSimpleEditorChange = React.useCallback(
        (newDef: Record<string, unknown>) => {
            form.setValue('definition', newDef, { shouldDirty: true });
        },
        [form]
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
                <label className="text-sm font-medium">Pipeline Definition</label>
                <Tabs value={editorMode} onValueChange={handleModeChange}>
                    <TabsList className="h-8">
                        <TabsTrigger value="simple" className="text-xs px-3">
                            Simple
                        </TabsTrigger>
                        <TabsTrigger value="visual" className="text-xs px-3">
                            Workflow
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
                                Loading visual editor...
                            </div>
                        }
                    >
                        <ReactFlowPipelineEditor
                            definition={visualDefinition}
                            onChange={handleVisualEditorChange}
                            issues={formattedIssues}
                        />
                    </React.Suspense>
                ) : (
                    <PipelineEditor
                        definition={definition}
                        onChange={handleSimpleEditorChange}
                        issues={formattedIssues}
                    />
                )}
            </div>
        </div>
    );
}
