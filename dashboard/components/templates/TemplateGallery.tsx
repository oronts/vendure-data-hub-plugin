/**
 * Template Gallery Component
 *
 * Displays available import templates with filtering and search capabilities.
 */

import * as React from 'react';
import { memo } from 'react';
import { CheckCircle, Package, Search } from 'lucide-react';
import { Badge, Input } from '@vendure/dashboard';
import type { TemplateCategory } from '../../types';
import type { ImportTemplate, CategoryInfo } from '../../hooks/use-import-templates';
import { resolveIconName } from '../../utils';
import { filterTemplates } from '../../utils/template-helpers';

export interface TemplateGalleryProps {
    templates: ImportTemplate[];
    categories: CategoryInfo[];
    selectedTemplate?: ImportTemplate | null;
    onSelectTemplate: (template: ImportTemplate) => void;
    onUseTemplate?: (template: ImportTemplate) => void;
}

function TemplateCardComponent({
    template,
    selected,
    onSelect,
}: {
    template: ImportTemplate;
    selected: boolean;
    onSelect: () => void;
}) {
    const IconComponent = resolveIconName(template.icon) ?? Package;

    return (
        <button
            type="button"
            onClick={onSelect}
            className={`
                relative p-4 rounded-lg border text-left transition-all w-full
                ${selected
                    ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                    : 'border-border hover:border-primary/50 hover:bg-muted/50'
                }
            `}
        >
            <div className="flex items-start gap-3">
                <div className={`p-2 rounded-md ${selected ? 'bg-primary/10' : 'bg-muted'}`}>
                    <IconComponent className={`h-5 w-5 ${selected ? 'text-primary' : 'text-muted-foreground'}`} />
                </div>

                <div className="flex-1 min-w-0">
                    <h4 className="font-medium text-sm truncate">{template.name}</h4>
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                        {template.description}
                    </p>

                    <div className="flex items-center gap-2 mt-3 flex-wrap">
                        {template.formats?.map(format => (
                            <Badge key={format} variant="outline" className="text-xs">
                                {format.toUpperCase()}
                            </Badge>
                        ))}
                        {template.tags?.map(tag => (
                            <Badge key={tag} variant="secondary" className="text-xs">
                                {tag}
                            </Badge>
                        ))}
                    </div>
                </div>
            </div>

            {selected && (
                <div className="absolute bottom-2 right-2">
                    <CheckCircle className="h-4 w-4 text-primary" />
                </div>
            )}
        </button>
    );
}

const TemplateCard = memo(TemplateCardComponent);

function CategoryTabComponent({
    category,
    selected,
    onSelect,
}: {
    category: CategoryInfo;
    selected: boolean;
    onSelect: () => void;
}) {
    const IconComponent = resolveIconName(category.icon) ?? Package;

    return (
        <button
            type="button"
            onClick={onSelect}
            className={`
                flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors whitespace-nowrap
                ${selected
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }
            `}
        >
            <IconComponent className="h-4 w-4" />
            <span>{category.label}</span>
            <Badge variant="secondary" className="ml-1 text-xs">
                {category.count}
            </Badge>
        </button>
    );
}

const CategoryTab = memo(CategoryTabComponent);

function TemplateGalleryComponent({
    templates,
    categories,
    selectedTemplate,
    onSelectTemplate,
}: TemplateGalleryProps) {
    const [searchQuery, setSearchQuery] = React.useState('');
    const [selectedCategory, setSelectedCategory] = React.useState<TemplateCategory | 'all'>('all');

    const filteredTemplates = React.useMemo(() => {
        let filtered = templates;

        // Filter by category
        if (selectedCategory !== 'all') {
            filtered = filtered.filter(t => t.category === selectedCategory);
        }

        // Filter by search query
        return filterTemplates(filtered, searchQuery);
    }, [templates, selectedCategory, searchQuery]);

    return (
        <div className="flex flex-col h-full">
            {/* Search Bar */}
            <div className="mb-4">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        type="text"
                        placeholder="Search templates..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        className="pl-9"
                    />
                </div>
            </div>

            {/* Category Tabs */}
            <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
                <button
                    type="button"
                    onClick={() => setSelectedCategory('all')}
                    className={`
                        flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors whitespace-nowrap
                        ${selectedCategory === 'all'
                            ? 'bg-primary text-primary-foreground'
                            : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                        }
                    `}
                >
                    All Templates
                    <Badge variant="secondary" className="ml-1 text-xs">
                        {templates.length}
                    </Badge>
                </button>
                {categories.map(cat => (
                    <CategoryTab
                        key={cat.category}
                        category={cat}
                        selected={selectedCategory === cat.category}
                        onSelect={() => setSelectedCategory(cat.category)}
                    />
                ))}
            </div>

            {/* Template Grid */}
            <div className="flex-1 overflow-y-auto">
                {filteredTemplates.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                        <Package className="h-12 w-12 text-muted-foreground/50 mb-4" />
                        <h3 className="text-lg font-medium">No templates found</h3>
                        <p className="text-sm text-muted-foreground mt-1">
                            Try adjusting your search or category filter
                        </p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {filteredTemplates.map(template => (
                            <TemplateCard
                                key={template.id}
                                template={template}
                                selected={selectedTemplate?.id === template.id}
                                onSelect={() => onSelectTemplate(template)}
                            />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

export const TemplateGallery = memo(TemplateGalleryComponent);
