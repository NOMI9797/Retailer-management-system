import { listCashRegisterHistory } from "@/modules/cash-flow/actions";
import { RegisterHistoryList } from "./RegisterHistoryList";
import type { RegisterHistorySearchParams } from "./searchParamsHref";

// Server Component: does the actual per-navigation fetch and hands it
// to RegisterHistoryList, the client leaf that owns Delete's confirm
// state — same split SalesHistoryTable/SalesHistoryList follows.
export async function RegisterHistoryTable({ searchParams }: { searchParams: RegisterHistorySearchParams }) {
  const entries = await listCashRegisterHistory({
    fromDate: searchParams.from,
    toDate: searchParams.to,
  });

  return <RegisterHistoryList entries={entries} />;
}
