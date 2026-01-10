import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { PipelineDefinition } from '../../types/pipeline/definition';
import { DiffEntry, RevisionDiff } from '../../types/versioning.types';
import { RevisionChangesSummary } from '../../entities/pipeline/pipeline-revision.entity';

/**
 * Service for computing differences between pipeline definitions
 */
@Injectable()
export class DiffService {
    /**
     * Compute a complete diff between two pipeline definitions
     */
    computeDiff(from: PipelineDefinition, to: PipelineDefinition): RevisionDiff {
        const added: DiffEntry[] = [];
        const removed: DiffEntry[] = [];
        const modified: DiffEntry[] = [];
        let unchangedCount = 0;

        // Compare steps
        const fromSteps = this.getStepsMap(from);
        const toSteps = this.getStepsMap(to);

        this.compareSteps(fromSteps, toSteps, added, removed, modified, unchangedCount);

        // Compare triggers
        this.compareTriggers(from, to, added, removed, modified);

        // Compare hooks
        this.compareHooks(from, to, added, removed, modified);

        // Compare edges
        this.compareEdges(from, to, added, removed, modified);

        // Compare metadata
        this.compareMetadata(from, to, modified);

        // Count unchanged
        unchangedCount = this.countUnchanged(fromSteps, toSteps);

        const summary = this.generateSummary(added, removed, modified);

        return {
            fromVersion: 0, // Will be set by caller
            toVersion: 0,   // Will be set by caller
            added,
            removed,
            modified,
            unchangedCount,
            summary,
        };
    }

    /**
     * Generate a changes summary for storage in the revision
     */
    generateChangesSummary(from: PipelineDefinition | null, to: PipelineDefinition): RevisionChangesSummary {
        if (!from) {
            const steps = this.getStepsMap(to);
            return {
                stepsAdded: Array.from(steps.keys()),
                stepsRemoved: [],
                stepsModified: [],
                triggersChanged: true,
                hooksChanged: to.hooks ? Object.keys(to.hooks).length > 0 : false,
                configChanges: 0,
                totalChanges: steps.size + 1,
            };
        }

        const diff = this.computeDiff(from, to);

        const stepsAdded = diff.added.filter(e => e.type === 'step').map(e => this.extractStepKey(e.path));
        const stepsRemoved = diff.removed.filter(e => e.type === 'step').map(e => this.extractStepKey(e.path));
        const stepsModified = diff.modified.filter(e => e.type === 'step').map(e => this.extractStepKey(e.path));

        const triggersChanged = diff.added.some(e => e.type === 'trigger') ||
                               diff.removed.some(e => e.type === 'trigger') ||
                               diff.modified.some(e => e.type === 'trigger');

        const hooksChanged = diff.added.some(e => e.type === 'hook') ||
                            diff.removed.some(e => e.type === 'hook') ||
                            diff.modified.some(e => e.type === 'hook');

        const configChanges = diff.modified.filter(e => e.type === 'config').length;

        return {
            stepsAdded: [...new Set(stepsAdded)],
            stepsRemoved: [...new Set(stepsRemoved)],
            stepsModified: [...new Set(stepsModified)],
            triggersChanged,
            hooksChanged,
            configChanges,
            totalChanges: diff.added.length + diff.removed.length + diff.modified.length,
        };
    }

    /**
     * Generate a human-readable label for a diff entry path
     */
    getHumanReadableLabel(path: string, definition: PipelineDefinition): string {
        const parts = path.split('.');

        if (parts[0] === 'steps' && parts[1]) {
            const stepKey = parts[1];
            const step = this.findStep(definition, stepKey);
            const stepName = step?.name || stepKey;

            if (parts.length === 2) {
                return `Step '${stepName}'`;
            }

            if (parts[2] === 'operators' && parts[3]) {
                const opIndex = parseInt(parts[3].replace(/\[|\]/g, ''), 10);
                const operators = (step as any)?.config?.operators;
                const opName = operators?.[opIndex]?.op || `operator ${opIndex}`;
                return `Step '${stepName}' → operator '${opName}'`;
            }

            if (parts[2] === 'config') {
                const configKey = parts[3] || 'config';
                return `Step '${stepName}' → ${configKey}`;
            }

            return `Step '${stepName}' → ${parts.slice(2).join('.')}`;
        }

        if (parts[0] === 'triggers' && parts[1]) {
            const triggerKey = parts[1];
            return `Trigger '${triggerKey}'`;
        }

        if (parts[0] === 'hooks' && parts[1]) {
            const hookIndex = parseInt(parts[1].replace(/\[|\]/g, ''), 10);
            return `Hook #${hookIndex + 1}`;
        }

        if (parts[0] === 'edges') {
            return `Edge connection`;
        }

        return path;
    }

    /**
     * Compute a hash of the definition for quick change detection
     */
    computeDefinitionHash(definition: PipelineDefinition): string {
        const normalized = JSON.stringify(definition, Object.keys(definition).sort());
        return createHash('sha256').update(normalized).digest('hex').substring(0, 64);
    }

    /**
     * Calculate definition size in bytes
     */
    calculateDefinitionSize(definition: PipelineDefinition): number {
        return Buffer.byteLength(JSON.stringify(definition), 'utf8');
    }

    // Private helper methods

    private getStepsMap(definition: PipelineDefinition): Map<string, unknown> {
        const steps = new Map<string, unknown>();

        if (definition.steps && Array.isArray(definition.steps)) {
            for (const step of definition.steps) {
                if (step.key) {
                    steps.set(step.key, step);
                }
            }
        }

        return steps;
    }

    private compareSteps(
        fromSteps: Map<string, unknown>,
        toSteps: Map<string, unknown>,
        added: DiffEntry[],
        removed: DiffEntry[],
        modified: DiffEntry[],
        unchangedCount: number
    ): void {
        // Find added steps
        for (const [key, step] of toSteps) {
            if (!fromSteps.has(key)) {
                added.push({
                    path: `steps.${key}`,
                    label: `Step '${key}'`,
                    type: 'step',
                    before: null,
                    after: step,
                });
            }
        }

        // Find removed steps
        for (const [key, step] of fromSteps) {
            if (!toSteps.has(key)) {
                removed.push({
                    path: `steps.${key}`,
                    label: `Step '${key}'`,
                    type: 'step',
                    before: step,
                    after: null,
                });
            }
        }

        // Find modified steps
        for (const [key, toStep] of toSteps) {
            const fromStep = fromSteps.get(key);
            if (fromStep && !this.deepEqual(fromStep, toStep)) {
                // Find specific changes within the step
                const stepDiffs = this.compareObjects(fromStep, toStep, `steps.${key}`);
                for (const diff of stepDiffs) {
                    modified.push({
                        ...diff,
                        type: 'step',
                    });
                }
            }
        }
    }

    private compareTriggers(
        from: PipelineDefinition,
        to: PipelineDefinition,
        added: DiffEntry[],
        removed: DiffEntry[],
        modified: DiffEntry[]
    ): void {
        const fromTriggers = from.triggers || [];
        const toTriggers = to.triggers || [];

        // Create maps by trigger type for comparison
        const fromMap = new Map(fromTriggers.map((t, i) => [(t as any).type || `trigger-${i}`, t]));
        const toMap = new Map(toTriggers.map((t, i) => [(t as any).type || `trigger-${i}`, t]));

        for (const [key, trigger] of toMap) {
            if (!fromMap.has(key)) {
                added.push({
                    path: `triggers.${key}`,
                    label: `Trigger '${key}'`,
                    type: 'trigger',
                    before: null,
                    after: trigger,
                });
            } else if (!this.deepEqual(fromMap.get(key), trigger)) {
                modified.push({
                    path: `triggers.${key}`,
                    label: `Trigger '${key}'`,
                    type: 'trigger',
                    before: fromMap.get(key),
                    after: trigger,
                });
            }
        }

        for (const [key, trigger] of fromMap) {
            if (!toMap.has(key)) {
                removed.push({
                    path: `triggers.${key}`,
                    label: `Trigger '${key}'`,
                    type: 'trigger',
                    before: trigger,
                    after: null,
                });
            }
        }
    }

    private compareHooks(
        from: PipelineDefinition,
        to: PipelineDefinition,
        added: DiffEntry[],
        removed: DiffEntry[],
        modified: DiffEntry[]
    ): void {
        const fromHooks = from.hooks || {};
        const toHooks = to.hooks || {};

        // Get all hook stage keys
        const allStages = new Set([
            ...Object.keys(fromHooks),
            ...Object.keys(toHooks),
        ]);

        for (const stage of allStages) {
            const fromHook = (fromHooks as Record<string, unknown>)[stage];
            const toHook = (toHooks as Record<string, unknown>)[stage];

            if (!fromHook && toHook) {
                added.push({
                    path: `hooks.${stage}`,
                    label: `Hook '${stage}'`,
                    type: 'hook',
                    before: null,
                    after: toHook,
                });
            } else if (fromHook && !toHook) {
                removed.push({
                    path: `hooks.${stage}`,
                    label: `Hook '${stage}'`,
                    type: 'hook',
                    before: fromHook,
                    after: null,
                });
            } else if (fromHook && toHook && !this.deepEqual(fromHook, toHook)) {
                modified.push({
                    path: `hooks.${stage}`,
                    label: `Hook '${stage}'`,
                    type: 'hook',
                    before: fromHook,
                    after: toHook,
                });
            }
        }
    }

    private compareEdges(
        from: PipelineDefinition,
        to: PipelineDefinition,
        added: DiffEntry[],
        removed: DiffEntry[],
        modified: DiffEntry[]
    ): void {
        const fromEdges = new Set((from.edges || []).map(e => `${e.from}->${e.to}`));
        const toEdges = new Set((to.edges || []).map(e => `${e.from}->${e.to}`));

        for (const edge of toEdges) {
            if (!fromEdges.has(edge)) {
                added.push({
                    path: `edges.${edge}`,
                    label: `Edge ${edge}`,
                    type: 'edge',
                    before: null,
                    after: edge,
                });
            }
        }

        for (const edge of fromEdges) {
            if (!toEdges.has(edge)) {
                removed.push({
                    path: `edges.${edge}`,
                    label: `Edge ${edge}`,
                    type: 'edge',
                    before: edge,
                    after: null,
                });
            }
        }
    }

    private compareMetadata(
        from: PipelineDefinition,
        to: PipelineDefinition,
        modified: DiffEntry[]
    ): void {
        const metaFields = ['name', 'description', 'capabilities'] as const;

        for (const field of metaFields) {
            if (!this.deepEqual((from as any)[field], (to as any)[field])) {
                modified.push({
                    path: field,
                    label: `Pipeline ${field}`,
                    type: 'meta',
                    before: (from as any)[field],
                    after: (to as any)[field],
                });
            }
        }
    }

    private countUnchanged(fromSteps: Map<string, unknown>, toSteps: Map<string, unknown>): number {
        let count = 0;
        for (const [key, fromStep] of fromSteps) {
            const toStep = toSteps.get(key);
            if (toStep && this.deepEqual(fromStep, toStep)) {
                count++;
            }
        }
        return count;
    }

    private generateSummary(added: DiffEntry[], removed: DiffEntry[], modified: DiffEntry[]): string {
        const parts: string[] = [];

        if (added.length > 0) {
            parts.push(`${added.length} added`);
        }
        if (removed.length > 0) {
            parts.push(`${removed.length} removed`);
        }
        if (modified.length > 0) {
            parts.push(`${modified.length} modified`);
        }

        if (parts.length === 0) {
            return 'No changes';
        }

        return parts.join(', ');
    }

    private extractStepKey(path: string): string {
        const match = path.match(/^steps\.([^.]+)/);
        return match ? match[1] : path;
    }

    private findStep(definition: PipelineDefinition, stepKey: string): { name?: string; config?: unknown } | undefined {
        return definition.steps?.find(s => s.key === stepKey);
    }

    private compareObjects(from: unknown, to: unknown, basePath: string): DiffEntry[] {
        const diffs: DiffEntry[] = [];

        if (typeof from !== 'object' || typeof to !== 'object' || from === null || to === null) {
            if (!this.deepEqual(from, to)) {
                diffs.push({
                    path: basePath,
                    label: basePath,
                    type: 'config',
                    before: from,
                    after: to,
                });
            }
            return diffs;
        }

        const fromObj = from as Record<string, unknown>;
        const toObj = to as Record<string, unknown>;
        const allKeys = new Set([...Object.keys(fromObj), ...Object.keys(toObj)]);

        for (const key of allKeys) {
            const newPath = `${basePath}.${key}`;
            if (!(key in fromObj)) {
                diffs.push({
                    path: newPath,
                    label: newPath,
                    type: 'config',
                    before: null,
                    after: toObj[key],
                });
            } else if (!(key in toObj)) {
                diffs.push({
                    path: newPath,
                    label: newPath,
                    type: 'config',
                    before: fromObj[key],
                    after: null,
                });
            } else if (!this.deepEqual(fromObj[key], toObj[key])) {
                // For nested objects, just show the top-level change
                diffs.push({
                    path: newPath,
                    label: newPath,
                    type: 'config',
                    before: fromObj[key],
                    after: toObj[key],
                });
            }
        }

        return diffs;
    }

    private deepEqual(a: unknown, b: unknown): boolean {
        if (a === b) return true;
        if (typeof a !== typeof b) return false;
        if (a === null || b === null) return a === b;

        if (typeof a !== 'object') return a === b;

        if (Array.isArray(a) && Array.isArray(b)) {
            if (a.length !== b.length) return false;
            return a.every((item, index) => this.deepEqual(item, b[index]));
        }

        if (Array.isArray(a) !== Array.isArray(b)) return false;

        const aObj = a as Record<string, unknown>;
        const bObj = b as Record<string, unknown>;
        const aKeys = Object.keys(aObj);
        const bKeys = Object.keys(bObj);

        if (aKeys.length !== bKeys.length) return false;

        return aKeys.every(key => this.deepEqual(aObj[key], bObj[key]));
    }
}
