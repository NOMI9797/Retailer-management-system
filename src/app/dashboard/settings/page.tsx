import { Suspense } from "react";
import { listAccountTypes } from "@/modules/settings/accountTypes.actions";
import { listAreas } from "@/modules/settings/areas.actions";
import { listCategories, listUnits, listProducts } from "@/modules/products/actions";
import { GrainProductActions } from "@/modules/products/components/GrainProductActions";
import { listMonthlyExpenseTypes } from "@/modules/expenses/actions";
import { listBankAccounts } from "@/modules/settings/bankAccounts.actions";
import { listDealers } from "@/modules/dealers/actions";
import { PageLoader } from "@/components/shared/PageLoader";
import { AccountTypeList } from "./AccountTypeList";
import { CategoryListManager } from "@/modules/settings/components/CategoryListManager";
import { UnitListManager } from "@/modules/settings/components/UnitListManager";
import { AreaListManager } from "@/modules/settings/components/AreaListManager";
import { MonthlyExpenseTypeListManager } from "@/modules/settings/components/MonthlyExpenseTypeListManager";
import { BankAccountListManager } from "@/modules/settings/components/BankAccountListManager";
import { DealerListManager } from "@/modules/dealers/components/DealerListManager";
import { SettingsHeader, type SettingsTab } from "./SettingsHeader";
import type { SettingsSearchParams } from "./searchParamsHref";

const VALID_TABS: SettingsTab[] = [
  "account-types",
  "categories",
  "units",
  "areas",
  "monthly-expense-types",
  "bank-accounts",
  "dealers",
  "grain-products",
];

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

  const [grainCategories, units] =
    tab === "grain-products" ? await Promise.all([listCategories(false, "GRAIN"), listUnits()]) : [[], []];

  return (
    <div>
      <SettingsHeader tab={tab} searchParams={params} grainCategories={grainCategories} units={units} />

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

      {tab === "bank-accounts" && (
        <Suspense fallback={<PageLoader label="Loading bank accounts…" />}>
          <BankAccountsSection />
        </Suspense>
      )}

      {tab === "dealers" && (
        <Suspense fallback={<PageLoader label="Loading dealers…" />}>
          <DealersSection />
        </Suspense>
      )}

      {tab === "grain-products" && (
        <Suspense fallback={<PageLoader label="Loading grain products…" />}>
          <GrainProductsSection categories={grainCategories} />
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
  const [productCategories, grainCategories] = await Promise.all([
    listCategories(true, "SIMPLE"),
    listCategories(true, "GRAIN"),
  ]);
  return <CategoryListManager productCategories={productCategories} grainCategories={grainCategories} />;
}

async function UnitsSection() {
  const units = await listUnits(true);
  return <UnitListManager units={units} />;
}

async function AreasSection() {
  const areas = await listAreas(true);
  return <AreaListManager areas={areas} />;
}

async function MonthlyExpenseTypesSection() {
  const types = await listMonthlyExpenseTypes(true);
  return <MonthlyExpenseTypeListManager types={types} />;
}

async function BankAccountsSection() {
  const bankAccounts = await listBankAccounts(true);
  return <BankAccountListManager bankAccounts={bankAccounts} />;
}

async function DealersSection() {
  const dealers = await listDealers({ includeInactive: true });
  return <DealerListManager dealers={dealers} />;
}

// Every grain product (Cotton, Wheat, ...) with its own Edit /
// Deactivate (Activate) / Delete — managed here rather than on the
// Grain page, which only picks one to work with.
async function GrainProductsSection({ categories }: { categories: Awaited<ReturnType<typeof listCategories>> }) {
  const { products } = await listProducts({ stockKind: "GRAIN", pageSize: 500, includeInactive: true });

  return (
    <div className="panel">
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Category</th>
            <th>Unit</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {products.length === 0 ? (
            <tr className="empty-row">
              <td colSpan={5}>No grain products yet — add one to start tracking grain.</td>
            </tr>
          ) : (
            products.map((product) => (
              <tr key={product.id}>
                <td style={{ fontWeight: 500 }}>{product.name}</td>
                <td>{product.category.name}</td>
                <td>{product.unit.name}</td>
                <td>
                  <span className={`status-badge ${product.isActive ? "active" : "inactive"}`}>
                    {product.isActive ? "Active" : "Inactive"}
                  </span>
                </td>
                <td style={{ textAlign: "right" }}>
                  <div style={{ display: "flex", justifyContent: "flex-end" }}>
                    <GrainProductActions product={product} categories={categories} />
                  </div>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
