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

      <h2 style={{ fontSize: 15, fontWeight: 600, margin: "24px 0 12px" }}>Account types</h2>
      <Suspense fallback={<PageLoader label="Loading account types…" />}>
        <AccountTypesSection />
      </Suspense>

      <h2 style={{ fontSize: 15, fontWeight: 600, margin: "28px 0 12px" }}>Categories</h2>
      <Suspense fallback={<PageLoader label="Loading categories…" />}>
        <CategoriesSection />
      </Suspense>

      <h2 style={{ fontSize: 15, fontWeight: 600, margin: "28px 0 12px" }}>Units</h2>
      <Suspense fallback={<PageLoader label="Loading units…" />}>
        <UnitsSection />
      </Suspense>

      <h2 style={{ fontSize: 15, fontWeight: 600, margin: "28px 0 12px" }}>Areas</h2>
      <Suspense fallback={<PageLoader label="Loading areas…" />}>
        <AreasSection />
      </Suspense>
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
