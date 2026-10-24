import Link from "next/link";
import { AddAccountTypeModal } from "@/modules/settings/components/AddAccountTypeModal";
import { AddProductModal } from "@/modules/products/components/AddProductModal";
import type { listCategories, listUnits } from "@/modules/products/actions";
import { buildSettingsHref, type SettingsSearchParams } from "./searchParamsHref";

export type SettingsTab =
  | "account-types"
  | "categories"
  | "units"
  | "areas"
  | "monthly-expense-types"
  | "bank-accounts"
  | "dealers"
  | "grain-products";

const TABS: { key: SettingsTab; label: string }[] = [
  { key: "account-types", label: "Account types" },
  { key: "categories", label: "Categories" },
  { key: "units", label: "Units" },
  { key: "areas", label: "Areas" },
  { key: "monthly-expense-types", label: "Monthly expense types" },
  { key: "bank-accounts", label: "Bank accounts" },
  { key: "dealers", label: "Dealers" },
  { key: "grain-products", label: "Grain products" },
];

// Same tab pattern as Products/Expenses/Reports — real ?tab=
// navigation, only the active tab's list renders below. The "Add
// account type" button only makes sense on the Account types tab (and
// "Add grain product" on the Grain products tab), so each swaps out
// entirely rather than sitting there disabled on every other tab.
// grainCategories/units are only loaded when the Grain products tab is
// open.
export function SettingsHeader({
  tab,
  searchParams,
  grainCategories = [],
  units = [],
}: {
  tab: SettingsTab;
  searchParams: SettingsSearchParams;
  grainCategories?: Awaited<ReturnType<typeof listCategories>>;
  units?: Awaited<ReturnType<typeof listUnits>>;
}) {
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Settings</h1>
          <p>Account types, categories, units, areas, bank accounts — the lists the rest of the app pulls from.</p>
        </div>
        {tab === "account-types" && <AddAccountTypeModal />}
        {tab === "grain-products" && (
          <AddProductModal
            categories={grainCategories}
            units={units}
            defaultStockKind="GRAIN"
            lockStockKind
            label="Add grain product"
          />
        )}
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
