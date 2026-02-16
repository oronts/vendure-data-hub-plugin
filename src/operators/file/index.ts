export * from './image-resize.operator';
export * from './image-convert.operator';
export * from './pdf-generate.operator';

import { IMAGE_RESIZE_OPERATOR_DEFINITION } from './image-resize.operator';
import { IMAGE_CONVERT_OPERATOR_DEFINITION } from './image-convert.operator';
import { PDF_GENERATE_OPERATOR_DEFINITION } from './pdf-generate.operator';
import { AdapterDefinition } from '../types';

export const FILE_OPERATOR_DEFINITIONS: AdapterDefinition[] = [
    IMAGE_RESIZE_OPERATOR_DEFINITION,
    IMAGE_CONVERT_OPERATOR_DEFINITION,
    PDF_GENERATE_OPERATOR_DEFINITION,
];
