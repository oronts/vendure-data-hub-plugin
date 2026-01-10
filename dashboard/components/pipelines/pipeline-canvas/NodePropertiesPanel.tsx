import * as React from 'react';
import {
    Input,
    Label,
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    ScrollArea,
    Separator,
} from '@vendure/dashboard';
import { Settings } from 'lucide-react';
import {
    SourceSettings,
    TransformSettings,
    ValidateSettings,
    FilterSettings,
    LoadSettings,
    ConditionSettings,
} from './SettingsComponents';
import type { NodePropertiesProps, PipelineNode } from './types';

export function NodePropertiesPanel({ node, schemas, connections, onUpdate, onClose }: NodePropertiesProps) {
    if (!node) return null;

    const handleConfigChange = (key: string, value: any) => {
        onUpdate({
            ...node,
            config: { ...node.config, [key]: value },
        });
    };

    return (
        <Sheet open={!!node} onOpenChange={() => onClose()}>
            <SheetContent className="w-[400px] sm:w-[540px]">
                <SheetHeader>
                    <SheetTitle className="flex items-center gap-2">
                        <Settings className="w-5 h-5" />
                        Configure: {node.name}
                    </SheetTitle>
                </SheetHeader>
                <ScrollArea className="h-[calc(100vh-120px)] pr-4">
                    <div className="space-y-6 py-4">
                        {/* Basic Settings */}
                        <div className="space-y-4">
                            <h4 className="font-medium">Basic Settings</h4>
                            <div className="space-y-2">
                                <Label>Node Name</Label>
                                <Input
                                    value={node.name}
                                    onChange={e => onUpdate({ ...node, name: e.target.value })}
                                />
                            </div>
                        </div>

                        <Separator />

                        {/* Source-specific settings */}
                        {node.type === 'source' && (
                            <SourceSettings node={node} connections={connections} onChange={handleConfigChange} />
                        )}

                        {/* Transform-specific settings */}
                        {node.type === 'transform' && (
                            <TransformSettings node={node} onChange={handleConfigChange} />
                        )}

                        {/* Validate-specific settings */}
                        {node.type === 'validate' && (
                            <ValidateSettings node={node} schemas={schemas} onChange={handleConfigChange} />
                        )}

                        {/* Filter-specific settings */}
                        {node.type === 'filter' && (
                            <FilterSettings node={node} onChange={handleConfigChange} />
                        )}

                        {/* Load-specific settings */}
                        {node.type === 'load' && (
                            <LoadSettings node={node} connections={connections} onChange={handleConfigChange} />
                        )}

                        {/* Condition-specific settings */}
                        {node.type === 'condition' && (
                            <ConditionSettings node={node} onChange={handleConfigChange} />
                        )}
                    </div>
                </ScrollArea>
            </SheetContent>
        </Sheet>
    );
}

export default NodePropertiesPanel;
