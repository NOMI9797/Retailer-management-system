import { Suspense } from "react";
import { listAccountTypes } from "@/modules/settings/accountTypes.actions";
import { listAreas } from "@/modules/settings/areas.actions";
import { listCategories, listUnits } from "@/modules/products/actions";
import { listMonthlyExpenseTypes } from "@/modules/expenses/actions";
import { PageLoader } from "@/components/shared/PageLoader";
import { AccountTypeList } from "./AccountTypeList";
import { CategoryListManager } from "@/modules/settings/components/CategoryListManager";
import { UnitListManager } from "@/modules/settings/components/UnitListManager";
import { AreaListManager } from "@/modules/settings/components/AreaListManager";
import { MonthlyExpenseTypeListManager } from "@/modules/settings/components/MonthlyExpenseTypeListManager";
import { SettingsHeader, type SettingsTab } from "./SettingsHeader";
import type { SettingsSearchParams } from "./searchParamsHref";

const VALID_TABS: SettingsTab[] = ["account-types", "categories", "units", "areas", "monthly-expense-types"];

// Tab-based, same shape as Products/Expenses/Reports — real ?tab=
// navigation, only the active tab's Suspense-wrapped section renders,
// rather than every list stacked on one long scrolling page.
export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<SettingsSearchParams>;
}) {
  const params = await searchParams;
  const tab: SettingsTab = VALID_TABS.includes(params.tab as SettingsTab)
    ? (params.tab as SettingsTab)
    : "account-types";

  return (
    <div>
      <SettingsHeader tab={tab} searchParams={params} />

      {tab === "account-types" && (
        <Suspense fallback={<PageLoader label="Loading account types…" />}>
          <AccountTypesSection />
        </Suspense>
      )}

      {tab === "categories" && (
        <Suspense fallback={<PageLoader label="Loading categories…" />}>
          <CategoriesSection />
        </Suspense>
      )}

      {tab === "units" && (
        <Suspense fallback={<PageLoader label="Loading units…" />}>
          <UnitsSection />
        </Suspense>
      )}

      {tab === "areas" && (
        <Suspense fallback={<PageLoader label="Loading areas…" />}>
          <AreasSection />
        </Suspense>
      )}

      {tab === "monthly-expense-types" && (
        <Suspense fallback={<PageLoader label="Loading monthly expense types…" />}>
          <MonthlyExpenseTypesSection />
        </Suspense>
      )}
    </div>
  );
}

async function AccountTypesSection() {
  const accountTypes = await listAccountTypes(true);
  return <AccountTypeList accountTypes={accountTypes} />;
}

async function CategoriesSection() {
  const categories = await listCategories(true);
  return <CategoryListManager categories={categories} />;
}

async function UnitsSection() {
  const units = await listUnits(true);
  return <UnitListManager units={units} />;
}

async function AreasSection() {
  const areas = await listAreas();
  return <AreaListManager areas={areas} />;
}

async function MonthlyExpenseTypesSection() {
  const types = await listMonthlyExpenseTypes(true);
  return <MonthlyExpenseTypeListManager types={types} />;
}
