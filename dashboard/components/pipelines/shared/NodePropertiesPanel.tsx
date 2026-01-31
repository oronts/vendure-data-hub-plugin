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
                config: { ...updated.config, adapterCode: updated.adapterCode },
                adapterCode: updated.adapterCode,
            },
        });
    }, [node, data, onUpdate]);

    // Early return after all hooks
    if (!node || !data || !stepConfigData) return null;

    return (
        <Sheet open={!!node} onOpenChange={() => onClose()}>
            <SheetContent
                className="overflow-y-auto p-0"
                style={{ width: panelWidth, maxWidth: PANEL_WIDTHS.MAX_VW }}
            >
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
