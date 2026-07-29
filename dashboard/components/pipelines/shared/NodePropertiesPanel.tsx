import * as React from 'react';
import { useCallback, useMemo, memo } from 'react';
import { Trans, useLingui } from '@lingui/react/macro';
import type { Node } from '@xyflow/react';
import {
    Button,
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    ScrollArea,
} from '@vendure/dashboard';
import { Trash2, Settings2 } from 'lucide-react';

import type { JsonObject, PipelineNodeData, ValidationIssue } from '../../../types';
import { useAdapterCatalog, AdapterMetadata } from '../../../hooks';
import { StepConfigPanel, StepConfigData, OperatorCheatSheetButton } from '../../shared/step-config';
import { PANEL_WIDTHS, SCROLL_HEIGHTS } from '../../../constants';
import { clampPanelWidth, resizePanelWithKey } from './panel-resize';

/** Minimum panel width (pixels) when resizing */
const MIN_PANEL_WIDTH = parseInt(PANEL_WIDTHS.PROPERTIES_MIN, 10) || 380;
const MAX_PANEL_WIDTH_RATIO = 0.9;

export interface NodePropertiesPanelProps {
    node: Node<PipelineNodeData> | null;
    onUpdate: (node: Node<PipelineNodeData>) => void;
    onDelete: () => void;
    onClose: () => void;
    catalog?: AdapterMetadata[];
    panelWidth?: string;
    showCheatSheet?: boolean;
    showStepTester?: boolean;
    showAdvancedEditors?: boolean;
    readOnly?: boolean;
    issues?: ValidationIssue[];
    catalogLoading?: boolean;
    catalogError?: Error | null;
}

function NodePropertiesPanelComponent({
    node,
    onUpdate,
    onDelete,
    onClose,
    catalog: externalCatalog,
    panelWidth = PANEL_WIDTHS.PROPERTIES_DEFAULT,
    showCheatSheet = true,
    showStepTester = true,
    showAdvancedEditors = true,
    readOnly = false,
    issues = [],
    catalogLoading,
    catalogError,
}: NodePropertiesPanelProps) {
    const { t } = useLingui();
    const hookResult = useAdapterCatalog();
    const catalog = externalCatalog ?? hookResult.adapters;

    // Resizable panel width
    const defaultWidth = parseInt(panelWidth, 10) || 520;
    const [width, setWidth] = React.useState(defaultWidth);
    const resizeStart = React.useRef<{
        pointerId: number;
        clientX: number;
        width: number;
    } | null>(null);
    const maximumWidth = useCallback(() => (
        typeof window === 'undefined'
            ? defaultWidth
            : Math.max(MIN_PANEL_WIDTH, window.innerWidth * MAX_PANEL_WIDTH_RATIO)
    ), [defaultWidth]);

    const onResizeStart = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        resizeStart.current = {
            pointerId: e.pointerId,
            clientX: e.clientX,
            width,
        };
    }, [width]);

    const onResizeMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
        const start = resizeStart.current;
        if (!start || start.pointerId !== event.pointerId) return;
        const delta = start.clientX - event.clientX;
        setWidth(clampPanelWidth(
            start.width + delta,
            MIN_PANEL_WIDTH,
            maximumWidth(),
        ));
    }, [maximumWidth]);

    const onResizeEnd = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
        if (resizeStart.current?.pointerId !== event.pointerId) return;
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
        }
        resizeStart.current = null;
    }, []);

    const onResizeKeyDown = useCallback((event: React.KeyboardEvent) => {
        const nextWidth = resizePanelWithKey(
            event.key,
            width,
            MIN_PANEL_WIDTH,
            maximumWidth(),
        );
        if (nextWidth === null) return;
        event.preventDefault();
        setWidth(nextWidth);
    }, [maximumWidth, width]);

    const data = node?.data;

    const selectedAdapter = useMemo(
        () => data ? catalog.find((a) => a.code === data.adapterCode) : undefined,
        [data, catalog]
    );

    const stepConfigData: StepConfigData | null = useMemo(() => {
        if (!data) return null;
        return {
            key: data.label,
            type: data.type,
            config: data.config ?? {},
            adapterCode: data.adapterCode,
            context: data.context,
            schemaRef: data.schemaRef,
        };
    }, [data]);

    const handleChange = useCallback((updated: StepConfigData) => {
        if (!node || !data || readOnly) return;
        onUpdate({
            ...node,
            data: {
                ...data,
                label: updated.key,
                type: updated.type,
                config: updated.config as JsonObject,
                adapterCode: updated.adapterCode || data.adapterCode,
                context: updated.context,
                schemaRef: updated.schemaRef,
            },
        });
    }, [node, data, onUpdate, readOnly]);

    const fieldErrors = useMemo(() => {
        if (!node) return {};
        return Object.fromEntries(
            issues
                .filter(issue => issue.stepKey === node.id && issue.field)
                .map(issue => [String(issue.field), issue.message]),
        );
    }, [issues, node]);

    // Early return after all hooks
    if (!node || !data || !stepConfigData) return null;

    return (
        <Sheet open={!!node} onOpenChange={open => {
            if (!open) onClose();
        }}>
            <SheetContent
                side="right"
                className="overflow-y-auto p-0 !max-w-none"
                style={{ width: `${width}px`, maxWidth: PANEL_WIDTHS.MAX_VW }}
            >
                {/* Resize drag handle (left edge) */}
                <div
                    className="absolute bottom-0 left-0 top-0 z-50 hidden w-2 cursor-col-resize touch-none sm:block
                               transition-colors hover:bg-primary/20 active:bg-primary/30 focus:bg-primary/20 focus:outline-none"
                    onPointerDown={onResizeStart}
                    onPointerMove={onResizeMove}
                    onPointerUp={onResizeEnd}
                    onPointerCancel={onResizeEnd}
                    onKeyDown={onResizeKeyDown}
                    role="separator"
                    tabIndex={0}
                    aria-orientation="vertical"
                    aria-valuemin={MIN_PANEL_WIDTH}
                    aria-valuemax={Math.round(maximumWidth())}
                    aria-valuenow={Math.round(width)}
                    aria-label={t`Resize panel`}
                />
                <SheetHeader className="flex-row items-center justify-between border-b bg-muted/30 px-4 py-3 pr-12">
                    <SheetTitle>
                        <div className="flex items-center gap-2">
                            {selectedAdapter ? (
                                <div
                                    className="w-7 h-7 rounded flex items-center justify-center text-white"
                                    style={{ backgroundColor: selectedAdapter.color }}
                                >
                                    <selectedAdapter.icon className="w-3.5 h-3.5" />
                                </div>
                            ) : (
                                <Settings2 className="w-5 h-5" />
                            )}
                            <span className="text-base">
                                <Trans>Configure Node</Trans>
                            </span>
                        </div>
                    </SheetTitle>
                    <div className="flex items-center gap-1">
                        {showCheatSheet && (
                            <OperatorCheatSheetButton label={t`Help`} />
                        )}
                        {!readOnly && (
                            <Button
                                variant="ghost"
                                size="sm"
                                className="text-destructive hover:text-destructive"
                                onClick={onDelete}
                                aria-label={t`Delete node`}
                            >
                                <Trash2 className="w-4 h-4" />
                            </Button>
                        )}
                    </div>
                </SheetHeader>

                <ScrollArea className={SCROLL_HEIGHTS.PROPERTIES_PANEL}>
                    <fieldset disabled={readOnly} className="px-4 py-4">
                        <StepConfigPanel
                            data={stepConfigData}
                            onChange={handleChange}
                            onDelete={onDelete}
                            catalog={catalog}
                            variant="panel"
                            showHeader={false}
                            showDeleteButton={false}
                            showKeyInput={true}
                            showCheatSheet={false}
                            showStepTester={showStepTester}
                            showAdvancedEditors={showAdvancedEditors}
                            compact={true}
                            errors={fieldErrors}
                            catalogLoading={catalogLoading}
                            catalogError={catalogError}
                        />
                    </fieldset>
                </ScrollArea>
            </SheetContent>
        </Sheet>
    );
}

export const NodePropertiesPanel = memo(NodePropertiesPanelComponent);
