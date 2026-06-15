import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * Keep a single piece of state in the URL query string instead of component
 * state or storage. Returns a [value, setValue] tuple that mirrors useState.
 *
 * The value always reflects the current `?key=` query param. Setting it to the
 * default value (or an empty string / null / undefined) removes the param so the
 * URL stays clean. Updates use the functional form of setSearchParams so multiple
 * params can be updated in the same render without clobbering each other, and use
 * { replace: true } so searching/filtering doesn't pollute browser history.
 *
 * @param {string} key - the query param name
 * @param {string} [defaultValue] - value when the param is absent
 * @returns {[string, (next: string | ((prev: string) => string)) => void]}
 */
export default function useQueryParamState(key, defaultValue = '') {
  const [searchParams, setSearchParams] = useSearchParams();
  const value = searchParams.get(key) ?? defaultValue;

  const setValue = useCallback(
    (next) => {
      setSearchParams(
        (prev) => {
          const params = new URLSearchParams(prev);
          const current = params.get(key) ?? defaultValue;
          const resolved = typeof next === 'function' ? next(current) : next;
          if (resolved === undefined || resolved === null || resolved === '' || resolved === defaultValue) {
            params.delete(key);
          } else {
            params.set(key, String(resolved));
          }
          return params;
        },
        { replace: true }
      );
    },
    [key, defaultValue, setSearchParams]
  );

  return [value, setValue];
}
