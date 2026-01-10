/**
 * usePrevious Hook
 * Returns the previous value of a variable
 */

import * as React from 'react';

export function usePrevious<T>(value: T): T | undefined {
    const ref = React.useRef<T>();

    React.useEffect(() => {
        ref.current = value;
    }, [value]);

    return ref.current;
}

export default usePrevious;
