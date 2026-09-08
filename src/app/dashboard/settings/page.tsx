import { Suspense } from "react";
import { listAccountTypes } from "@/modules/settings/accountTypes.actions";
import { listAreas } from "@/modules/settings/areas.actions";
import { listCategories, listUnits } from "@/modules/products/actions";
import { PageLoader } from "@/components/shared/PageLoader";
import { AccountTypeList } from "./AccountTypeList";
import { AddAccountTypeModal } from "@/modules/settings/components/AddAccountTypeModal";
import { CategoryListManager } from "@/modules/settings/components/CategoryListManager";
import { UnitListManager } from "@/modules/settings/components/UnitListManager";
import { AreaListManager } from "@/modules/settings/components/AreaListManager";
import { MonthlyExpenseTypeListManager } from "@/modules/settings/components/MonthlyExpenseTypeListManager";
import { listMonthlyExpenseTypes } from "@/modules/expenses/actions";

// Same shape as the Products page: a static header (instant, no data
// dependency) plus one Suspense-wrapped section per list. Each list
// is independent — a slow fetch in one section never blocks the
// others from appearing.
export default function SettingsPage() {
  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Settings</h1>
          <p>Account types, categories, units, areas — the lists the rest of the app pulls from.</p>
        </div>
        <AddAccountTypeModal />
      </div>

      <section className="block">
        <h2 className="block-title">Account types</h2>
        <Suspense fallback={<PageLoader label="Loading account types…" />}>
          <AccountTypesSection />
        </Suspense>
      </section>

      <section className="block">
        <h2 className="block-title">Categories</h2>
        <Suspense fallback={<PageLoader label="Loading categories…" />}>
          <CategoriesSection />
        </Suspense>
      </section>

      <section className="block">
        <h2 className="block-title">Units</h2>
        <Suspense fallback={<PageLoader label="Loading units…" />}>
          <UnitsSection />
        </Suspense>
      </section>

      <section className="block">
        <h2 className="block-title">Areas</h2>
        <Suspense fallback={<PageLoader label="Loading areas…" />}>
          <AreasSection />
        </Suspense>
      </section>

      <section className="block">
        <h2 className="block-title">Monthly expense types</h2>
        <Suspense fallback={<PageLoader label="Loading monthly expense types…" />}>
          <MonthlyExpenseTypesSection />
        </Suspense>
      </section>
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
