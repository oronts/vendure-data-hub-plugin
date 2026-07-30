import { describe, expect, it } from 'vitest';
import { EXPORT_ENTITY_SCHEMAS } from '../../extractors/vendure-query/export-entity-schemas';
import type { DataHubPluginOptions } from '../../types/plugin-options';
import { TemplateRegistryService } from './template-registry.service';

describe('TemplateRegistryService export templates', () => {
    it('ships only templates supported by the generic export extractor', () => {
        const service = new TemplateRegistryService({} as DataHubPluginOptions);
        const supportedEntities = new Set<string>(
            EXPORT_ENTITY_SCHEMAS.map(schema => schema.entityType),
        );

        for (const template of service.getExportTemplates()) {
            expect(template.definition?.sourceEntity).toBeDefined();
            expect(supportedEntities.has(template.definition?.sourceEntity ?? '')).toBe(true);
        }
    });
});
