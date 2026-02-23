/**
 * Shared constants for import/export wizards.
 *
 * Icon mappings for source types and file formats have been removed.
 * Source type icons (DATABASE, WEBHOOK, CDC, etc.) now come from backend
 * adapter metadata via resolveIconName(). Smart-source icons (FILE, API)
 * live in SourceStep.tsx since they are hand-built UI types, not adapters.
 * File format icons now come from backend config options (fileFormats.icon).
 */

export {
    FILE_FORMAT,
    SOURCE_TYPE,
} from '../../../constants';

export type { TransformTypeOption } from '../../../constants/fallbacks';
