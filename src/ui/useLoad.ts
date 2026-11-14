"use client";

import { useCallback, useEffect, useState } from "react";

export type Load<T> = { status: "loading" } | { status: "error" } | { status: "ready"; data: T };

/** Runs an async loader on mount; `retry` runs it again. Gives every data screen its loading/error/ready states. */
export function useLoad<T>(loader: () => Promise<T>) {
  const [state, setState] = useState<Load<T>>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    loader().then(
      (data) => live && setState({ status: "ready", data }),
      (err) => {
        console.error(err);
        if (live) setState({ status: "error" });
      },
    );
    return () => {
      live = false;
    };
    // the loader is a module-level function; re-run only on retry
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);
  const retry = useCallback(() => {
    setState({ status: "loading" });
    setAttempt((n) => n + 1);
  }, []);
  return [state, retry, setState] as const;
}
