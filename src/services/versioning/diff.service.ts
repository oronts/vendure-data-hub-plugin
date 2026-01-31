import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { PipelineDefinition, PipelineStepDefinition, DiffEntry, RevisionDiff } from '../../types/index';
import { DiffEntryType, StepType } from '../../constants/enums';
import { RevisionChangesSummary } from '../../entities/pipeline/pipeline-revision.entity';

@Injectable()
export class DiffService {
    computeDiff(from: PipelineDefinition, to: PipelineDefinition): RevisionDiff {
        const added: DiffEntry[] = [];
        const removed: DiffEntry[] = [];
        const modified: DiffEntry[] = [];
        let unchangedCount = 0;

        const fromSteps = this.getStepsMap(from);
        const toSteps = this.getStepsMap(to);

        this.compareSteps(fromSteps, toSteps, added, removed, modified, unchangedCount);
        this.compareTriggers(from, to, added, removed, modified);
        this.compareHooks(from, to, added, removed, modified);
        this.compareEdges(from, to, added, removed, modified);
        this.compareMetadata(from, to, modified);

        unchangedCount = this.countUnchanged(fromSteps, toSteps);

        const summary = this.generateSummary(added, removed, modified);

        return {
            fromVersion: 0,
            toVersion: 0,
            added,
            removed,
            modified,
            unchangedCount,
            summary,
        };
    }

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

        const stepsAdded = diff.added.filter(e => e.type === DiffEntryType.STEP).map(e => this.extractStepKey(e.path));
        const stepsRemoved = diff.removed.filter(e => e.type === DiffEntryType.STEP).map(e => this.extractStepKey(e.path));
        const stepsModified = diff.modified.filter(e => e.type === DiffEntryType.STEP).map(e => this.extractStepKey(e.path));

        const triggersChanged = diff.added.some(e => e.type === DiffEntryType.TRIGGER) ||
                               diff.removed.some(e => e.type === DiffEntryType.TRIGGER) ||
                               diff.modified.some(e => e.type === DiffEntryType.TRIGGER);

        const hooksChanged = diff.added.some(e => e.type === DiffEntryType.HOOK) ||
                            diff.removed.some(e => e.type === DiffEntryType.HOOK) ||
                            diff.modified.some(e => e.type === DiffEntryType.HOOK);

        const configChanges = diff.modified.filter(e => e.type === DiffEntryType.CONFIG).length;

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
                const stepConfig = step?.config as { operators?: Array<{ op?: string }> } | undefined;
                const operators = stepConfig?.operators;
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

    computeDefinitionHash(definition: PipelineDefinition): string {
        const normalized = JSON.stringify(definition, Object.keys(definition).sort());
        return createHash('sha256').update(normalized).digest('hex').substring(0, 64);
    }

    calculateDefinitionSize(definition: PipelineDefinition): number {
        return Buffer.byteLength(JSON.stringify(definition), 'utf8');
    }

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
        _unchangedCount: number
    ): void {
        for (const [key, step] of toSteps) {
            if (!fromSteps.has(key)) {
                added.push({
                    path: `steps.${key}`,
                    label: `Step '${key}'`,
                    type: DiffEntryType.STEP,
                    before: null,
                    after: step,
                });
            }
        }

        for (const [key, step] of fromSteps) {
            if (!toSteps.has(key)) {
                removed.push({
                    path: `steps.${key}`,
                    label: `Step '${key}'`,
                    type: DiffEntryType.STEP,
                    before: step,
                    after: null,
                });
            }
        }

        for (const [key, toStep] of toSteps) {
            const fromStep = fromSteps.get(key);
            if (fromStep && !this.deepEqual(fromStep, toStep)) {
                const stepDiffs = this.compareObjects(fromStep, toStep, `steps.${key}`);
                for (const diff of stepDiffs) {
                    modified.push({
                        ...diff,
                        type: DiffEntryType.STEP,
                    });
                }
            }
        }
    }

    /**
     * Get trigger steps from definition
     * Triggers are stored as steps with type 'TRIGGER'
     */
    private getTriggerSteps(definition: PipelineDefinition): PipelineStepDefinition[] {
        return (definition.steps || []).filter(s => s.type === StepType.TRIGGER);
    }

    private compareTriggers(
        from: PipelineDefinition,
        to: PipelineDefinition,
        added: DiffEntry[],
        removed: DiffEntry[],
        modified: DiffEntry[]
    ): void {
        // Extract trigger steps from definitions
        const fromTriggers = this.getTriggerSteps(from);
        const toTriggers = this.getTriggerSteps(to);

        // Key triggers by their step key
        const fromMap = new Map(fromTriggers.map(t => [t.key, t]));
        const toMap = new Map(toTriggers.map(t => [t.key, t]));

        for (const [key, trigger] of toMap) {
            if (!fromMap.has(key)) {
                added.push({
                    path: `steps.${key}`,
                    label: `Trigger '${key}'`,
                    type: DiffEntryType.TRIGGER,
                    before: null,
                    after: trigger,
                });
            } else if (!this.deepEqual(fromMap.get(key), trigger)) {
                modified.push({
                    path: `steps.${key}`,
                    label: `Trigger '${key}'`,
                    type: DiffEntryType.TRIGGER,
                    before: fromMap.get(key),
                    after: trigger,
                });
            }
        }

        for (const [key, trigger] of fromMap) {
            if (!toMap.has(key)) {
                removed.push({
                    path: `steps.${key}`,
                    label: `Trigger '${key}'`,
                    type: DiffEntryType.TRIGGER,
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
                    type: DiffEntryType.HOOK,
                    before: null,
                    after: toHook,
                });
            } else if (fromHook && !toHook) {
                removed.push({
                    path: `hooks.${stage}`,
                    label: `Hook '${stage}'`,
                    type: DiffEntryType.HOOK,
                    before: fromHook,
                    after: null,
                });
            } else if (fromHook && toHook && !this.deepEqual(fromHook, toHook)) {
                modified.push({
                    path: `hooks.${stage}`,
                    label: `Hook '${stage}'`,
                    type: DiffEntryType.HOOK,
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
        _modified: DiffEntry[]
    ): void {
        const fromEdges = new Set((from.edges || []).map(e => `${e.from}->${e.to}`));
        const toEdges = new Set((to.edges || []).map(e => `${e.from}->${e.to}`));

        for (const edge of toEdges) {
            if (!fromEdges.has(edge)) {
                added.push({
                    path: `edges.${edge}`,
                    label: `Edge ${edge}`,
                    type: DiffEntryType.EDGE,
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
                    type: DiffEntryType.EDGE,
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
            const fromValue = (from as unknown as Record<string, unknown>)[field];
            const toValue = (to as unknown as Record<string, unknown>)[field];
            if (!this.deepEqual(fromValue, toValue)) {
                modified.push({
                    path: field,
                    label: `Pipeline ${field}`,
                    type: DiffEntryType.META,
                    before: fromValue,
                    after: toValue,
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
                    type: DiffEntryType.CONFIG,
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
                    type: DiffEntryType.CONFIG,
                    before: null,
                    after: toObj[key],
                });
            } else if (!(key in toObj)) {
                diffs.push({
                    path: newPath,
                    label: newPath,
                    type: DiffEntryType.CONFIG,
                    before: fromObj[key],
                    after: null,
                });
            } else if (!this.deepEqual(fromObj[key], toObj[key])) {
                diffs.push({
                    path: newPath,
                    label: newPath,
                    type: DiffEntryType.CONFIG,
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
