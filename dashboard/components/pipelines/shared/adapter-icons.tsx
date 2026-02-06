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
import { ADAPTER_TYPES } from '../../../constants';

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
    vendureQuery: Database,
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
    assetImport: Image,
    facetUpsert: Filter,
    facetValueUpsert: Filter,
    orderTransition: RefreshCw,
    restPost: Send,
};

export function getAdapterIcon(adapterType: string, code?: string): IconType {
    const adapterCode = (code || '').trim();
    if (adapterType === ADAPTER_TYPES.OPERATOR) {
        return OPERATOR_ICON_MAP[adapterCode] || RefreshCw;
    }
    if (adapterType === ADAPTER_TYPES.EXTRACTOR) {
        return EXTRACTOR_ICON_MAP[adapterCode] || Download;
    }
    if (adapterType === ADAPTER_TYPES.LOADER) {
        return LOADER_ICON_MAP[adapterCode] || Upload;
    }
    return Box;
}
