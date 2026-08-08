export function toPipelineTs(definition: unknown): string {
    const json = JSON.stringify(definition, null, 2);
    return `import { definePipeline } from '@oronts/vendure-data-hub-plugin';

export default definePipeline(${json} as const);
`;
}
