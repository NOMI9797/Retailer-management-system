import Link from "next/link";
import { AddAccountTypeModal } from "@/modules/settings/components/AddAccountTypeModal";
import { buildSettingsHref, type SettingsSearchParams } from "./searchParamsHref";

export type SettingsTab = "account-types" | "categories" | "units" | "areas" | "monthly-expense-types";

const TABS: { key: SettingsTab; label: string }[] = [
  { key: "account-types", label: "Account types" },
  { key: "categories", label: "Categories" },
  { key: "units", label: "Units" },
  { key: "areas", label: "Areas" },
  { key: "monthly-expense-types", label: "Monthly expense types" },
];

// Same tab pattern as Products/Expenses/Reports — real ?tab=
// navigation, only the active tab's list renders below. The "Add
// account type" button only makes sense on the Account types tab, so
// it swaps out entirely rather than sitting there disabled on every
// other tab.
export function SettingsHeader({ tab, searchParams }: { tab: SettingsTab; searchParams: SettingsSearchParams }) {
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Settings</h1>
          <p>Account types, categories, units, areas — the lists the rest of the app pulls from.</p>
        </div>
        {tab === "account-types" && <AddAccountTypeModal />}
      </div>

      <div className="tabs">
        {TABS.map((t) => (
          <Link
            key={t.key}
            className={`tab${tab === t.key ? " active" : ""}`}
            href={buildSettingsHref(searchParams, { tab: t.key })}
          >
            {t.label}
          </Link>
        ))}
      </div>
    </>
  );
}
