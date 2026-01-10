import * as React from 'react';
import { Button, Card, CardContent, Badge } from '@vendure/dashboard';
import { X, Table, CheckCircle, AlertCircle, Box } from 'lucide-react';
import { getNodeTypeInfo } from './helpers';
import type { PipelineNodeProps } from './types';

export function PipelineNodeComponent({ node, selected, onSelect, onDelete, onDragStart }: PipelineNodeProps) {
    const nodeType = getNodeTypeInfo(node.config.adapterCode, node.type);
    const Icon = nodeType?.icon || Box;
    const color = nodeType?.color || 'bg-gray-500';

    const getStatusBadge = () => {
        if (node.config._status === 'error') {
            return (
                <Badge variant="destructive" className="absolute -top-2 -right-2 h-5 w-5 p-0 flex items-center justify-center">
                    <AlertCircle className="w-3 h-3" />
                </Badge>
            );
        }
        if (node.config._status === 'success') {
            return (
                <Badge className="absolute -top-2 -right-2 h-5 w-5 p-0 flex items-center justify-center bg-green-500">
                    <CheckCircle className="w-3 h-3" />
                </Badge>
            );
        }
        return null;
    };

    return (
        <div
            className={`relative group cursor-pointer transition-all duration-200 ${selected ? 'scale-105' : ''}`}
            onClick={onSelect}
            draggable
            onDragStart={onDragStart}
        >
            <Card className={`w-48 ${selected ? 'ring-2 ring-primary shadow-lg' : 'hover:shadow-md'}`}>
                <CardContent className="p-3">
                    <div className="flex items-center gap-2">
                        <div className={`w-8 h-8 rounded-lg ${color} flex items-center justify-center text-white`}>
                            <Icon className="w-4 h-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium truncate">{node.name}</div>
                            <div className="text-xs text-muted-foreground truncate">{nodeType?.name || node.type}</div>
                        </div>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 opacity-0 group-hover:opacity-100"
                            onClick={(e) => { e.stopPropagation(); onDelete(); }}
                        >
                            <X className="w-3 h-3" />
                        </Button>
                    </div>
                    {node.config._recordCount !== undefined && (
                        <div className="mt-2 text-xs text-muted-foreground flex items-center gap-1">
                            <Table className="w-3 h-3" />
                            {node.config._recordCount.toLocaleString()} records
                        </div>
                    )}
                </CardContent>
            </Card>
            {getStatusBadge()}
            {/* Connection ports */}
            {node.inputs.length > 0 && (
                <div className="absolute -left-2 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-background border-2 border-muted-foreground" />
            )}
            {node.outputs.length > 0 && (
                <div className="absolute -right-2 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-background border-2 border-primary" />
            )}
        </div>
    );
}

export default PipelineNodeComponent;
