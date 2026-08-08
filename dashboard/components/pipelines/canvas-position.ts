export interface CanvasPoint {
    readonly x: number;
    readonly y: number;
}

interface FlowPositionProjector {
    screenToFlowPosition(position: CanvasPoint): CanvasPoint;
}

export interface PaletteDragData {
    readonly nodeType: string;
    readonly category: string;
    readonly label: string;
}

export function resolveCanvasPosition(
    projector: FlowPositionProjector | null,
    clientPosition: CanvasPoint,
): CanvasPoint {
    return projector?.screenToFlowPosition(clientPosition) ?? clientPosition;
}

export function parsePaletteDragData(value: string): PaletteDragData | null {
    if (!value) return null;
    try {
        const parsed: unknown = JSON.parse(value);
        if (!parsed || typeof parsed !== 'object') return null;
        const nodeType = Reflect.get(parsed, 'nodeType');
        const category = Reflect.get(parsed, 'category');
        const label = Reflect.get(parsed, 'label');
        return typeof nodeType === 'string'
            && typeof category === 'string'
            && typeof label === 'string'
            ? { nodeType, category, label }
            : null;
    } catch {
        return null;
    }
}
