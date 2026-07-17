import type { PipelineDefinition } from '../../types';

export interface PipelineDependencyNode {
    code: string;
    definition: Pick<PipelineDefinition, 'dependsOn'>;
}

function getDependencies(
    definition: Pick<PipelineDefinition, 'dependsOn'> | null | undefined,
): string[] {
    return Array.isArray(definition?.dependsOn)
        ? definition.dependsOn.filter((code): code is string => typeof code === 'string')
        : [];
}

export function findReachableDependencyCycle(
    rootCode: string,
    rootDefinition: Pick<PipelineDefinition, 'dependsOn'>,
    pipelines: readonly PipelineDependencyNode[],
): string[] | null {
    const graph = new Map(
        pipelines.map(pipeline => [pipeline.code, getDependencies(pipeline.definition)]),
    );
    graph.set(rootCode, getDependencies(rootDefinition));

    const visited = new Set<string>();
    const visiting = new Set<string>();
    const path: string[] = [];

    const visit = (code: string): string[] | null => {
        const cycleStart = path.indexOf(code);
        if (visiting.has(code) && cycleStart >= 0) {
            return [...path.slice(cycleStart), code];
        }
        if (visited.has(code)) return null;

        visiting.add(code);
        path.push(code);
        for (const dependency of graph.get(code) ?? []) {
            const cycle = visit(dependency);
            if (cycle) return cycle;
        }
        path.pop();
        visiting.delete(code);
        visited.add(code);
        return null;
    };

    return visit(rootCode);
}
