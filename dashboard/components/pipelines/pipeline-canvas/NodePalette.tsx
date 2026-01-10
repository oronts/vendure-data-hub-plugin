import * as React from 'react';
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    ScrollArea,
} from '@vendure/dashboard';
import { Layers, ChevronRight, ChevronDown } from 'lucide-react';
import { NODE_CATALOG } from './constants';

interface NodePaletteProps {
    onAddNode: (type: string, category: string) => void;
}

export function NodePalette({ onAddNode }: NodePaletteProps) {
    const [expanded, setExpanded] = React.useState<Record<string, boolean>>({
        sources: true,
        transforms: true,
        validation: true,
        filtering: false,
        routing: false,
        destinations: true,
    });

    const categories = [
        { key: 'sources', label: 'Import', items: NODE_CATALOG.sources },
        { key: 'transforms', label: 'Transform', items: NODE_CATALOG.transforms },
        { key: 'validation', label: 'Validate', items: NODE_CATALOG.validation },
        { key: 'filtering', label: 'Filter', items: NODE_CATALOG.filtering },
        { key: 'routing', label: 'Routing', items: NODE_CATALOG.routing },
        { key: 'destinations', label: 'Export', items: NODE_CATALOG.destinations },
    ];

    return (
        <Card className="w-64 h-full">
            <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                    <Layers className="w-4 h-4" />
                    Operations
                </CardTitle>
            </CardHeader>
            <CardContent className="p-2">
                <ScrollArea className="h-[calc(100vh-250px)]">
                    <div className="space-y-1">
                        {categories.map(cat => (
                            <div key={cat.key}>
                                <button
                                    className="w-full flex items-center justify-between px-2 py-1.5 text-sm font-medium hover:bg-muted rounded"
                                    onClick={() => setExpanded({ ...expanded, [cat.key]: !expanded[cat.key] })}
                                >
                                    <span>{cat.label}</span>
                                    {expanded[cat.key] ? (
                                        <ChevronDown className="w-4 h-4" />
                                    ) : (
                                        <ChevronRight className="w-4 h-4" />
                                    )}
                                </button>
                                {expanded[cat.key] && (
                                    <div className="ml-2 space-y-1 mt-1">
                                        {cat.items.map(item => (
                                            <button
                                                key={item.type}
                                                className="w-full flex items-center gap-2 px-2 py-1.5 text-sm hover:bg-muted rounded transition-colors"
                                                onClick={() => onAddNode(item.type, cat.key)}
                                                draggable
                                                onDragStart={e => {
                                                    e.dataTransfer.setData('nodeType', item.type);
                                                    e.dataTransfer.setData('category', cat.key);
                                                }}
                                            >
                                                <div className={`w-6 h-6 rounded ${item.color} flex items-center justify-center text-white`}>
                                                    <item.icon className="w-3 h-3" />
                                                </div>
                                                <span className="truncate">{item.name}</span>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </ScrollArea>
            </CardContent>
        </Card>
    );
}

export default NodePalette;
