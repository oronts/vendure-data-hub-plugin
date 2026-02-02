import { ID, Asset } from '@vendure/core';
import { InputRecord } from '../../types/index';
import { TargetOperation } from '../../types/index';
import { VendureEntityType } from '../../constants/enums';

export interface FocalPointInput {
    /** Horizontal focal point (0-1) */
    x: number;
    /** Vertical focal point (0-1) */
    y: number;
}

export interface AssetInput extends InputRecord {
    /** Display name for the asset (auto-generated from URL if not provided) */
    name?: string;
    /** URL to download the asset from */
    sourceUrl: string;
    /** Focal point for image cropping */
    focalPoint?: FocalPointInput;
    /** Array of tag names to assign to the asset */
    tags?: string[];
    /** Custom field values */
    customFields?: Record<string, unknown>;
}

export interface ExistingEntityResult {
    id: ID;
    entity: Asset;
}

export const ASSET_LOADER_METADATA = {
    entityType: VendureEntityType.ASSET,
    name: 'Asset Loader',
    description: 'Imports media assets (images, files) from URLs',
    supportedOperations: ['CREATE', 'UPDATE', 'UPSERT', 'DELETE'] as TargetOperation[],
    lookupFields: ['name', 'id', 'source'],
    requiredFields: ['sourceUrl'],
} as const;

export const MIME_TYPES: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.pdf': 'application/pdf',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
} as const;
