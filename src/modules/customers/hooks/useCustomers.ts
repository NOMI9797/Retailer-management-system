"use client";

import { useEffect, useState } from "react";
import { listCustomers } from "../actions";

// Client-side interactive state (live search-as-you-type) that a
// Server Component can't express — this is the legitimate case for a
// hook per the module's server-first convention: everywhere else,
// pages fetch directly, but a customer picker needs to refetch on
// every keystroke while the rest of its parent form stays mounted.
// areaId/accountTypeId are optional extra filters (used by the Udhaar
// Clearance picker's "search by filters" requirement) — omitted
// everywhere else, so existing callers are unaffected.
export function useCustomers(search?: string, areaId?: string, accountTypeId?: string) {
  const [customers, setCustomers] = useState<Awaited<ReturnType<typeof listCustomers>>["customers"]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    listCustomers({ search, areaId, accountTypeId }).then((result) => {
      if (!cancelled) {
        setCustomers(result.customers);
        setIsLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [search, areaId, accountTypeId]);

  return { customers, isLoading };
}
