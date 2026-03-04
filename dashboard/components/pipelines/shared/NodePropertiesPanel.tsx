import * as React from 'react';
import { useCallback, useMemo, memo } from 'react';
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

import type { PipelineNodeData } from '../../../types';
import { useAdapterCatalog, AdapterMetadata } from '../../../hooks';
import { StepConfigPanel, StepConfigData, OperatorCheatSheetButton } from '../../shared/step-config';
import { PANEL_WIDTHS, SCROLL_HEIGHTS } from '../../../constants';

/** Minimum panel width (pixels) when resizing */
const MIN_PANEL_WIDTH = parseInt(PANEL_WIDTHS.PROPERTIES_MIN, 10) || 380;

export interface NodePropertiesPanelProps {
    node: Node<PipelineNodeData> | null;
    onUpdate: (node: Node<PipelineNodeData>) => void;
    onDelete: () => void;
    onClose: () => void;
    catalog?: AdapterMetadata[];
    connectionCodes?: string[];
    secretOptions?: Array<{ code: string; provider?: string }>;
    panelWidth?: string;
    showCheatSheet?: boolean;
    showStepTester?: boolean;
    showAdvancedEditors?: boolean;
}

function NodePropertiesPanelComponent({
    node,
    onUpdate,
    onDelete,
    onClose,
    catalog: externalCatalog,
    connectionCodes: externalConnectionCodes,
    secretOptions: externalSecretOptions,
    panelWidth = PANEL_WIDTHS.PROPERTIES_DEFAULT,
    showCheatSheet = true,
    showStepTester = true,
    showAdvancedEditors = true,
}: NodePropertiesPanelProps) {
    const hookResult = useAdapterCatalog();
    const catalog = externalCatalog ?? hookResult.adapters;
    const connectionCodes = externalConnectionCodes ?? hookResult.connectionCodes;
    const secretOptions = externalSecretOptions ?? hookResult.secretOptions;

    // Resizable panel width
    const defaultWidth = parseInt(panelWidth, 10) || 520;
    const [width, setWidth] = React.useState(defaultWidth);
    const dragging = React.useRef(false);

    const onResizeStart = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        dragging.current = true;
        const startX = e.clientX;
        const startW = width;
        const onMove = (ev: MouseEvent) => {
            if (!dragging.current) return;
            // Panel opens from right — dragging left increases width
            const delta = startX - ev.clientX;
            setWidth(Math.max(MIN_PANEL_WIDTH, Math.min(window.innerWidth * 0.9, startW + delta)));
        };
        const onUp = () => {
            dragging.current = false;
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    }, [width]);

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
        };
    }, [data]);

    const handleChange = useCallback((updated: StepConfigData) => {
        if (!node || !data) return;
        onUpdate({
            ...node,
            data: {
                ...data,
                label: updated.key,
                type: updated.type,
                config: updated.config,
                adapterCode: updated.adapterCode || data.adapterCode,
            },
        });
    }, [node, data, onUpdate]);

    // Early return after all hooks
    if (!node || !data || !stepConfigData) return null;

    return (
        <Sheet open={!!node} onOpenChange={() => onClose()}>
            <SheetContent
                side="right"
                className="overflow-y-auto p-0 !max-w-none"
                style={{ width: `${width}px`, maxWidth: PANEL_WIDTHS.MAX_VW }}
            >
                {/* Resize drag handle (left edge) */}
                <div
                    className="absolute left-0 top-0 bottom-0 w-1.5 cursor-col-resize z-50
                               hover:bg-primary/20 active:bg-primary/30 transition-colors"
                    onMouseDown={onResizeStart}
                    role="separator"
                    aria-orientation="vertical"
                    aria-label="Resize panel"
                />
                <SheetHeader className="px-4 py-3 border-b bg-muted/30">
                    <SheetTitle className="flex items-center justify-between">
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
                            <span className="text-base">Configure Node</span>
                        </div>
                        <div className="flex items-center gap-1">
                            {showCheatSheet && <OperatorCheatSheetButton label="Help" />}
                            <Button
                                variant="ghost"
                                size="sm"
                                className="text-destructive hover:text-destructive"
                                onClick={onDelete}
                                aria-label="Delete node"
                            >
                                <Trash2 className="w-4 h-4" />
                            </Button>
                        </div>
                    </SheetTitle>
                </SheetHeader>

                <ScrollArea className={SCROLL_HEIGHTS.PROPERTIES_PANEL}>
                    <div className="px-4 py-4">
                        <StepConfigPanel
                            data={stepConfigData}
                            onChange={handleChange}
                            onDelete={onDelete}
                            catalog={catalog}
                            connectionCodes={connectionCodes}
                            secretOptions={secretOptions}
                            variant="panel"
                            showHeader={false}
                            showDeleteButton={false}
                            showKeyInput={true}
                            showCheatSheet={false}
                            showStepTester={showStepTester}
                            showAdvancedEditors={showAdvancedEditors}
                            compact={true}
                        />
                    </div>
                </ScrollArea>
            </SheetContent>
        </Sheet>
    );
}

export const NodePropertiesPanel = memo(NodePropertiesPanelComponent);
