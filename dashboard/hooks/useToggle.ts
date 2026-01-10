/**
 * useToggle Hook
 * Simple boolean toggle state management
 */

import * as React from 'react';

export function useToggle(
    initialValue: boolean = false
): [boolean, () => void, (value: boolean) => void] {
    const [value, setValue] = React.useState(initialValue);

    const toggle = React.useCallback(() => {
        setValue(v => !v);
    }, []);

    const setTo = React.useCallback((newValue: boolean) => {
        setValue(newValue);
    }, []);

    return [value, toggle, setTo];
}

export default useToggle;
