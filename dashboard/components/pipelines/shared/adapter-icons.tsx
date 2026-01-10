import * as React from 'react';
import {
    Box,
    Braces,
    CheckCircle,
    Database,
    DollarSign,
    FileText,
    Filter,
    Globe,
    Layers,
    List,
    RefreshCw,
    Ruler,
    Search,
    Sigma,
    SplitSquareVertical,
    Trash2,
    Upload,
    Download,
    ArrowRightCircle,
    ArrowLeftRight,
    Users,
    Image,
    Ticket,
    Send,
} from 'lucide-react';

type IconType = React.ComponentType<{ className?: string }>;

const OPERATOR_ICON_MAP: Record<string, IconType> = {
    map: List,
    template: Braces,
    when: Filter,
    lookup: Search,
    currency: DollarSign,
    unit: Ruler,
    aggregate: Sigma,
    set: ArrowRightCircle,
    remove: Trash2,
    rename: ArrowLeftRight,
    deltaFilter: SplitSquareVertical,
    validateRequired: CheckCircle,
    validateFormat: Layers,
};

const EXTRACTOR_ICON_MAP: Record<string, IconType> = {
    rest: Globe,
    csv: FileText,
    graphql: Database,
    'vendure-query': Database,
};

const LOADER_ICON_MAP: Record<string, IconType> = {
    productUpsert: Box,
    variantUpsert: Box,
    customerUpsert: Users,
    orderNote: FileText,
    stockAdjust: Box,
    applyCoupon: Ticket,
    collectionUpsert: Layers,
    promotionUpsert: Ticket,
    assetAttach: Image,
    orderTransition: RefreshCw,
    restPost: Send,
};

export function getAdapterIcon(adapterType: string, code?: string): IconType {
    const c = (code || '').trim();
    if (adapterType === 'operator') {
        return OPERATOR_ICON_MAP[c] || RefreshCw;
    }
    if (adapterType === 'extractor') {
        return EXTRACTOR_ICON_MAP[c] || Download;
    }
    if (adapterType === 'loader') {
        return LOADER_ICON_MAP[c] || Upload;
    }
    return Box;
}

