import * as React from 'react';
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    Input,
    ScrollArea,
} from '@vendure/dashboard';
import {
    Download,
    RefreshCw,
    CheckCircle,
    GitBranch,
    Upload,
    Rss,
    Cloud,
    Layers,
    ChevronRight,
    ChevronDown,
    Search,
} from 'lucide-react';
import { NODE_CATALOG } from './constants';
import type { NodePaletteProps } from './types';

export function NodePalette({ onDragStart }: NodePaletteProps) {
    const [expanded, setExpanded] = React.useState<Record<string, boolean>>({
        sources: true,
        transforms: true,
        validation: false,
        routing: false,
        destinations: true,
        feeds: true,
        exports: false,
    });

    const [search, setSearch] = React.useState('');

    const categories = [
        { key: 'sources', label: 'Data Sources', items: NODE_CATALOG.sources, category: 'source', icon: Download },
        { key: 'transforms', label: 'Transforms', items: NODE_CATALOG.transforms, category: 'transform', icon: RefreshCw },
        { key: 'validation', label: 'Validation', items: NODE_CATALOG.validation, category: 'validate', icon: CheckCircle },
        { key: 'routing', label: 'Routing', items: NODE_CATALOG.routing, category: 'condition', icon: GitBranch },
        { key: 'destinations', label: 'Vendure Load', items: NODE_CATALOG.destinations, category: 'load', icon: Upload },
        { key: 'feeds', label: 'Feed Exports', items: NODE_CATALOG.feeds, category: 'feed', icon: Rss },
        { key: 'exports', label: 'File Exports', items: NODE_CATALOG.exports, category: 'export', icon: Cloud },
    ];

    const filteredCategories = categories.map(cat => ({
        ...cat,
        items: cat.items.filter(item =>
            item.label.toLowerCase().includes(search.toLowerCase()) ||
            item.description.toLowerCase().includes(search.toLowerCase())
        ),
    })).filter(cat => cat.items.length > 0 || !search);

    return (
        <Card className="w-64 h-full flex flex-col">
            <CardHeader className="py-3 px-3">
                <CardTitle className="text-sm flex items-center gap-2">
                    <Layers className="w-4 h-4" />
                    Node Palette
                </CardTitle>
                <div className="relative mt-2">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                        placeholder="Search nodes..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="pl-8 h-8 text-sm"
                    />
                </div>
            </CardHeader>
            <CardContent className="p-2 flex-1 overflow-hidden">
                <ScrollArea className="h-full">
                    <div className="space-y-1 pr-2">
                        {filteredCategories.map(cat => (
                            <div key={cat.key}>
                                <button
                                    className="w-full flex items-center justify-between px-2 py-1.5 text-sm font-medium hover:bg-muted rounded transition-colors"
                                    onClick={() => setExpanded(e => ({ ...e, [cat.key]: !e[cat.key] }))}
                                >
                                    <div className="flex items-center gap-2">
                                        <cat.icon className="w-4 h-4 text-muted-foreground" />
                                        <span>{cat.label}</span>
                                    </div>
                                    {expanded[cat.key] ? (
                                        <ChevronDown className="w-4 h-4" />
                                    ) : (
                                        <ChevronRight className="w-4 h-4" />
                                    )}
                                </button>
                                {expanded[cat.key] && (
                                    <div className="ml-2 space-y-0.5 mt-1">
                                        {cat.items.map(item => (
                                            <div
                                                key={item.type}
                                                className="flex items-center gap-2 px-2 py-1.5 text-sm hover:bg-muted rounded cursor-grab active:cursor-grabbing transition-colors"
                                                draggable
                                                onDragStart={e => onDragStart(e, item.type, cat.category, item.label)}
                                            >
                                                <div
                                                    className="w-6 h-6 rounded flex items-center justify-center text-white flex-shrink-0"
                                                    style={{ backgroundColor: item.color }}
                                                >
                                                    <item.icon className="w-3.5 h-3.5" />
                                                </div>
                                                <div className="min-w-0">
                                                    <div className="text-xs font-medium truncate">{item.label}</div>
                                                    <div className="text-[10px] text-muted-foreground truncate">{item.description}</div>
                                                </div>
                                            </div>
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
