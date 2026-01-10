import { ALL_NODE_TYPES } from './constants';

/**
 * Get node type info from catalog
 */
export function getNodeTypeInfo(adapterCode?: string, nodeType?: string) {
    return ALL_NODE_TYPES.find(n => n.type === adapterCode || n.type === nodeType);
}

/**
 * Map category key to node type
 */
export function getCategoryNodeType(category: string): string {
    switch (category) {
        case 'sources':
            return 'source';
        case 'transforms':
            return 'transform';
        case 'validation':
            return 'validate';
        case 'filtering':
            return 'filter';
        case 'routing':
            return 'condition';
        case 'destinations':
            return 'load';
        default:
            return 'transform';
    }
}
