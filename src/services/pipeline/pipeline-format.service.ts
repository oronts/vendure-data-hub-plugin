/**
 * Pipeline Format Service
 *
 * Converts between canonical (step-based) and visual (nodes/edges) pipeline formats.
 * Centralizes format conversion logic in the backend for consistency.
 */

import { Injectable } from '@nestjs/common';
import { StepType } from '../../constants/index';
import type {
    PipelineDefinition,
    PipelineCapabilities,
} from '../../types/index';
import type { SchemaReference, StepContextOverride } from '../../../shared/types';
import { getErrorMessage } from '../../utils/error.utils';
import { valuesEqual } from '../../../shared/utils/lossless-conversion';
import {
    type BackendFormatMappings,
    convertBackendToCanonical,
    convertBackendToVisual,
} from './pipeline-format-conversion';

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
    context?: StepContextOverride;
    schemaRef?: SchemaReference;
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
    label?: string;
}

export interface BackendVisualNodeBaseline {
    sourceIndex: number;
    id: string;
    type: VisualNodeCategory;
    label: string;
    adapterCode?: string;
    config: Record<string, unknown>;
    context?: StepContextOverride;
    schemaRef?: SchemaReference;
}

export interface BackendVisualEdgeBaseline {
    sourceIndex?: number;
    id: string;
    source: string;
    target: string;
    sourceHandle?: string;
    targetHandle?: string;
    label?: string;
    inferred: boolean;
}

export interface BackendVisualConversionMetadata {
    source: Record<string, unknown>;
    nodeIdentity: string;
    edgeIdentity: string;
    nodes: BackendVisualNodeBaseline[];
    edges: BackendVisualEdgeBaseline[];
}

/**
 * Visual pipeline definition (nodes/edges format) - backend version.
 * Uses backend VisualNode/VisualEdge types for pipeline format conversion.
 *
 * Parallel definition in dashboard/types/pipeline.ts uses ReactFlow
 * PipelineNode/Edge types for the visual editor UI.
 */
export interface VisualPipelineDefinition {
    nodes: VisualNode[];
    edges: VisualEdge[];
    variables?: Record<string, unknown>;
    capabilities?: PipelineCapabilities;
    dependsOn?: string[];
    trigger?: unknown;
    conversion?: BackendVisualConversionMetadata;
}

/** Visual node categories (mapped to ReactFlow node types) */
export type VisualNodeCategory = 'trigger' | 'source' | 'transform' | 'validate' | 'condition' | 'load' | 'filter' | 'feed' | 'export' | 'sink' | 'enrich' | 'gate';

// FORMAT SERVICE

@Injectable()
export class PipelineFormatService {
    /**
     * Default node spacing for visual layout
     */
    private readonly defaultNodeSpacingX = 240;
    private readonly defaultStartX = 120;
    private readonly defaultStartY = 120;

    /**
     * Lookup map from StepType to visual node category
     * Extensibility point - add new step types here without modifying control flow
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
        [StepType.GATE]: 'gate',
    };

    /**
     * Lookup map from visual node category to StepType
     * Extensibility point - add new categories here without modifying control flow
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
        filter: StepType.TRANSFORM,
        gate: StepType.GATE,
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
        gate: 'gate',
    };

    private getFormatMappings(): BackendFormatMappings {
        return {
            stepTypeToCategory: stepType => this.stepTypeToCategory(stepType),
            categoryToStepType: category => this.categoryToStepType(category),
            categoryToNodeType: category => this.categoryToNodeType(category),
            nodePosition: index => ({
                x: this.defaultStartX + index * this.defaultNodeSpacingX,
                y: this.defaultStartY,
            }),
        };
    }

    toVisual(definition: PipelineDefinition | null | undefined): VisualPipelineDefinition {
        return convertBackendToVisual(definition, this.getFormatMappings());
    }

    toCanonical(
        definition: VisualPipelineDefinition | Record<string, unknown> | null | undefined,
    ): PipelineDefinition {
        return convertBackendToCanonical(definition, this.getFormatMappings());
    }

    isVisualFormat(definition: unknown): boolean {
        if (!definition || typeof definition !== 'object') return false;
        return Array.isArray((definition as Record<string, unknown>).nodes);
    }
    private stepTypeToCategory(stepType: StepType | string): VisualNodeCategory {
        const type = String(stepType).toUpperCase();
        const category = PipelineFormatService.STEP_TYPE_TO_CATEGORY[type];
        if (!category) {
            throw new Error(`Unsupported pipeline step type "${stepType}"`);
        }
        return category;
    }

    private categoryToStepType(category: VisualNodeCategory | string): StepType {
        const stepType = PipelineFormatService.CATEGORY_TO_STEP_TYPE[category];
        if (!stepType) {
            throw new Error(`Unsupported visual node category "${category}"`);
        }
        return stepType;
    }

    private categoryToNodeType(category: VisualNodeCategory): string {
        const nodeType = PipelineFormatService.CATEGORY_TO_NODE_TYPE[category];
        if (!nodeType) {
            throw new Error(`Unsupported visual node category "${category}"`);
        }
        return nodeType;
    }

    /**
     * Validate format conversion consistency
     * Useful for testing round-trip conversion
     */
    validateRoundTrip(definition: PipelineDefinition): { isValid: boolean; issues: string[] } {
        try {
            const canonical = this.toCanonical(this.toVisual(definition));
            if (!valuesEqual(definition, canonical)) {
                return {
                    isValid: false,
                    issues: ['Round-trip conversion changed the canonical definition'],
                };
            }
            return { isValid: true, issues: [] };
        } catch (error) {
            return {
                isValid: false,
                issues: [`Round-trip conversion failed: ${getErrorMessage(error)}`],
            };
        }
    }
}
