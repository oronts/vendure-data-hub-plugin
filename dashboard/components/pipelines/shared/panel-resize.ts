export const PANEL_RESIZE_STEP_PX = 16;

export function clampPanelWidth(width: number, minimum: number, maximum: number): number {
    return Math.max(minimum, Math.min(maximum, width));
}

export function resizePanelWithKey(
    key: string,
    current: number,
    minimum: number,
    maximum: number,
): number | null {
    switch (key) {
        case 'ArrowLeft':
            return clampPanelWidth(current + PANEL_RESIZE_STEP_PX, minimum, maximum);
        case 'ArrowRight':
            return clampPanelWidth(current - PANEL_RESIZE_STEP_PX, minimum, maximum);
        case 'Home':
            return minimum;
        case 'End':
            return maximum;
        default:
            return null;
    }
}
