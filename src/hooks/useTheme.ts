import { useEffect } from 'react';
import type { Settings } from '../lib/types';

export function useApplyTheme(theme: Settings['theme']) {
  useEffect(() => {
    // One look, and it is dark: the stored setting (from when there was a light theme) is ignored.
    document.documentElement.classList.add('dark');
  }, [theme]);
}
