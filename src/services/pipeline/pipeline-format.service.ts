/**
 * Pipeline Format Service
 *
 * Handles conversion between canonical (step-based) and visual (nodes/edges) pipeline formats.
 * This service centralizes format conversion logic in the backend to ensure consistency
 * and remove business logic from the frontend.
 */

import { Injectable } from '@nestjs/common';
import { StepType } from '../../constants/index';
import { PipelineDefinition, PipelineStepDefinition, PipelineEdge, PipelineCapabilities, PipelineContext } from '../../types/index';

// VISUAL FORMAT TYPES

/**
 * Visual node position
 */
export interface NodePosition {
    x: number;
    y: number;
}

/**
 * Visual node data
 */
export interface VisualNodeData {
    label: string;
    type: VisualNodeCategory;
    adapterCode?: string;
    config: Record<string, unknown>;
}

/**
 * Visual node (ReactFlow compatible)
 */
export interface VisualNode {
    id: string;
    type: string;
    position: NodePosition;
    data: VisualNodeData;
}

/**
 * Visual edge (ReactFlow compatible)
 */
export interface VisualEdge {
    id: string;
    source: string;
    target: string;
    sourceHandle?: string;
    targetHandle?: string;
}

/**
 * Visual pipeline definition (nodes/edges format)
 */
export interface VisualPipelineDefinition {
    nodes: VisualNode[];
    edges: VisualEdge[];
    variables?: Record<string, unknown>;
    capabilities?: PipelineCapabilities;
    dependsOn?: string[];
    trigger?: unknown;
}

/**
 * Visual node categories (mapped to ReactFlow node types)
 * Must match all StepType enum values for consistent round-trip conversion
 */
export type VisualNodeCategory = 'trigger' | 'source' | 'transform' | 'validate' | 'condition' | 'load' | 'filter' | 'feed' | 'export' | 'sink' | 'enrich';

// FORMAT SERVICE

@Injectable()
export class PipelineFormatService {
    /**
     * Default node spacing for visual layout
     */
    private readonly DEFAULT_NODE_SPACING_X = 240;
    private readonly DEFAULT_NODE_SPACING_Y = 120;
    private readonly DEFAULT_START_X = 120;
    private readonly DEFAULT_START_Y = 120;

    /**
     * Lookup map from StepType to visual node category
     * Provides extensibility - add new step types here without modifying control flow
     * Note: StepType enum values are uppercase strings, so we only need one entry per type
     * Each StepType maps to its own category for lossless round-trip conversion
     */
    private static readonly STEP_TYPE_TO_CATEGORY: Record<string, VisualNodeCategory> = {
        [StepType.TRIGGER]: 'trigger',
        [StepType.EXTRACT]: 'source',
        [StepType.TRANSFORM]: 'transform',
        [StepType.VALIDATE]: 'validate',
        [StepType.ENRICH]: 'enrich',
        [StepType.ROUTE]: 'condition',
        [StepType.LOAD]: 'load',
        [StepType.EXPORT]: 'export',
        [StepType.FEED]: 'feed',
        [StepType.SINK]: 'sink',
    };

    /**
     * Lookup map from visual node category to StepType
     * Provides extensibility - add new categories here without modifying control flow
     * Bidirectional mapping for lossless round-trip conversion
     */
    private static readonly CATEGORY_TO_STEP_TYPE: Record<string, StepType> = {
        trigger: StepType.TRIGGER,
        source: StepType.EXTRACT,
        transform: StepType.TRANSFORM,
        validate: StepType.VALIDATE,
        enrich: StepType.ENRICH,
        condition: StepType.ROUTE,
        load: StepType.LOAD,
        export: StepType.EXPORT,
        feed: StepType.FEED,
        sink: StepType.SINK,
        // Legacy/alias mappings for backward compatibility
        filter: StepType.TRANSFORM,
    };

    /**
     * Lookup map from category to ReactFlow node type
     * Maps visual categories to the actual node component types in ReactFlow
     */
    private static readonly CATEGORY_TO_NODE_TYPE: Record<VisualNodeCategory, string> = {
        trigger: 'trigger',
        source: 'source',
        transform: 'transform',
        validate: 'validate',
        enrich: 'enrich',
        condition: 'condition',
        load: 'load',
        export: 'export',
        feed: 'feed',
        sink: 'sink',
        filter: 'transform',
    };

    /**
     * Convert canonical (step-based) definition to visual (nodes/edges) format
     */
    toVisual(definition: PipelineDefinition | null | undefined): VisualPipelineDefinition {
        if (!definition) {
            return {
                nodes: [],
                edges: [],
                variables: {},
                capabilities: undefined,
                dependsOn: undefined,
                trigger: undefined,
            };
        }

        if (this.isVisualFormat(definition)) {
            return definition as unknown as VisualPipelineDefinition;
        }

        const steps: PipelineStepDefinition[] = Array.isArray(definition.steps) ? definition.steps : [];
        const nodes = this.stepsToNodes(steps);
        const edges = this.convertEdges(definition.edges, nodes);

        return {
            nodes,
            edges,
            variables: (definition.context ?? {}) as Record<string, unknown>,
            capabilities: definition.capabilities,
            dependsOn: definition.dependsOn,
            trigger: definition.trigger as unknown,
        };
    }

    /**
     * Convert visual (nodes/edges) definition to canonical (step-based) format
     */
    toCanonical(definition: VisualPipelineDefinition | Record<string, unknown> | null | undefined): PipelineDefinition {
        if (!definition) {
            return { version: 1, steps: [] };
        }

        const def = definition as Record<string, unknown>;

        if (this.hasNodesArray(def)) {
            return this.visualToCanonical(definition as VisualPipelineDefinition);
        }

        if (Array.isArray(def.steps)) {
            return {
                ...(def as unknown as PipelineDefinition),
                version: typeof def.version === 'number' && def.version > 0 ? def.version : 1,
            };
        }

        return { version: 1, steps: [], ...def } as unknown as PipelineDefinition;
    }

    /**
     * Check if a definition is in visual format
     */
    isVisualFormat(definition: unknown): boolean {
        if (!definition || typeof definition !== 'object') return false;
        const def = definition as Record<string, unknown>;
        return Array.isArray(def.nodes) && def.nodes.length > 0;
    }

    /**
     * Check if a definition has a nodes array (even empty)
     */
    private hasNodesArray(definition: Record<string, unknown>): boolean {
        return Array.isArray(definition.nodes) && definition.nodes.length > 0;
    }

    /**
     * Convert steps array to visual nodes
     */
    private stepsToNodes(steps: PipelineStepDefinition[]): VisualNode[] {
        return steps.map((step, index) => {
            const id = String(step.key ?? `step-${index}`);
            const category = this.stepTypeToCategory(step.type);
            const nodeType = this.categoryToNodeType(category);

            const adapterCode = (step.config as Record<string, unknown>)?.adapterCode as string | undefined;
            const label = step.name || step.key || `Step ${index + 1}`;

            return {
                id,
                type: nodeType,
                position: {
                    x: this.DEFAULT_START_X + index * this.DEFAULT_NODE_SPACING_X,
                    y: this.DEFAULT_START_Y,
                },
                data: {
                    label,
                    type: category,
                    adapterCode,
                    config: (step.config ?? {}) as Record<string, unknown>,
                },
            };
        });
    }

    /**
     * Convert canonical edges to visual edges, or generate sequential edges if none provided
     */
    private convertEdges(edges: PipelineEdge[] | undefined, nodes: VisualNode[]): VisualEdge[] {
        if (Array.isArray(edges) && edges.length > 0) {
            return edges.map((e, idx) => ({
                id: String((e as any).id ?? `edge-${idx}`),
                source: String(e.from),
                target: String(e.to),
                sourceHandle: e.branch,
            }));
        }

        return nodes.slice(1).map((node, index) => ({
            id: `edge-${index}`,
            source: nodes[index].id,
            target: node.id,
        }));
    }

    /**
     * Convert visual definition to canonical format
     */
    private visualToCanonical(visual: VisualPipelineDefinition): PipelineDefinition {
        const nodes = visual.nodes ?? [];
        const steps = nodes.map((node, idx) => this.nodeToStep(node, idx));

        const edges: PipelineEdge[] = (visual.edges ?? []).map((e, i) => ({
            id: (e as any).id ?? `edge-${i}`,
            from: e.source,
            to: e.target,
            branch: e.sourceHandle,
        }));

        const result: PipelineDefinition = {
            version: 1,
            steps,
            edges,
            context: (visual.variables ?? {}) as PipelineContext,
        };

        if (visual.capabilities) {
            result.capabilities = visual.capabilities;
        }
        if (visual.dependsOn) {
            result.dependsOn = visual.dependsOn;
        }
        if (visual.trigger) {
            result.trigger = visual.trigger as any;
        }

        return result;
    }

    /**
     * Convert a visual node to a pipeline step
     */
    private nodeToStep(node: VisualNode, index: number): PipelineStepDefinition {
        const data = node.data ?? {};
        const stepType = this.categoryToStepType(data.type);

        const adapterCode = data.adapterCode || (data.config?.adapterCode as string) || '';
        const existingConfig = (data.config ?? {}) as Record<string, unknown>;
        const { adapterCode: _unused, ...restConfig } = existingConfig;

        return {
            key: node.id ?? `step-${index}`,
            type: stepType,
            name: data.label,
            config: {
                ...restConfig,
                adapterCode,
            },
        };
    }

    /**
     * Map StepType enum to visual node category using lookup map
     * Falls back to 'transform' for unknown types to ensure forward compatibility
     */
    private stepTypeToCategory(stepType: StepType | string): VisualNodeCategory {
        // StepType enum values are already uppercase strings
        const type = String(stepType).toUpperCase();
        return PipelineFormatService.STEP_TYPE_TO_CATEGORY[type] ?? 'transform';
    }

    /**
     * Map visual node category to StepType enum using lookup map
     * Falls back to TRANSFORM for unknown categories to ensure forward compatibility
     */
    private categoryToStepType(category: VisualNodeCategory | string): StepType {
        return PipelineFormatService.CATEGORY_TO_STEP_TYPE[category] ?? StepType.TRANSFORM;
    }

    /**
     * Map category to ReactFlow node type string using lookup map
     * Falls back to 'transform' for unknown categories
     */
    private categoryToNodeType(category: VisualNodeCategory): string {
        return PipelineFormatService.CATEGORY_TO_NODE_TYPE[category] ?? 'transform';
    }

    /**
     * Validate format conversion consistency
     * Useful for testing round-trip conversion
     */
    validateRoundTrip(definition: PipelineDefinition): { isValid: boolean; issues: string[] } {
        const issues: string[] = [];

        try {
            // Convert to visual and back
            const visual = this.toVisual(definition);
            const canonical = this.toCanonical(visual);

            // Check step count
            if (definition.steps.length !== canonical.steps.length) {
                issues.push(`Step count mismatch: ${definition.steps.length} vs ${canonical.steps.length}`);
            }

            // Check each step
            for (let i = 0; i < definition.steps.length; i++) {
                const original = definition.steps[i];
                const converted = canonical.steps[i];

                if (original.key !== converted.key) {
                    issues.push(`Step ${i}: key mismatch - "${original.key}" vs "${converted.key}"`);
                }

                if (original.type !== converted.type) {
                    issues.push(`Step ${i}: type mismatch - "${original.type}" vs "${converted.type}"`);
                }

                const origConfig = original.config as Record<string, unknown>;
                const convConfig = converted.config as Record<string, unknown>;

                if (origConfig.adapterCode !== convConfig.adapterCode) {
                    issues.push(`Step ${i}: adapterCode mismatch - "${origConfig.adapterCode}" vs "${convConfig.adapterCode}"`);
                }
            }

            // Check edges
            const origEdges = definition.edges ?? [];
            const convEdges = canonical.edges ?? [];
            if (origEdges.length !== convEdges.length) {
                issues.push(`Edge count mismatch: ${origEdges.length} vs ${convEdges.length}`);
            }
        } catch (e) {
            issues.push(`Round-trip conversion failed: ${e instanceof Error ? e.message : String(e)}`);
        }

        return {
            isValid: issues.length === 0,
            issues,
        };
    }
}
