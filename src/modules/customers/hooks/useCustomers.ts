"use client";

import { useEffect, useState } from "react";
import { listCustomers } from "../actions";

// Hooks do the reading — this one wraps a Server Action for a client
// component that needs live, filterable data (e.g. a searchable
// customer picker inside the Daily Sales form). Swap the body for
// TanStack Query once you need caching across multiple components;
// the call sites below don't change.
export function useCustomers(query?: string) {
  const [customers, setCustomers] = useState<Awaited<ReturnType<typeof listCustomers>>>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    listCustomers(query).then((result) => {
      if (!cancelled) {
        setCustomers(result);
        setIsLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [query]);

  return { customers, isLoading };
}
