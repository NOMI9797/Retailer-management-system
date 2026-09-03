// Placeholder until Clerk Organizations is wired in (see build order,
// step 9 skips ahead of this — roles come after, tenancy comes first).
// Every Server Action should call this to get the current shop's id,
// so scoping by shopId is never left to individual feature code to
// remember. Swap the body for `auth().orgId` (Clerk) once auth exists.
export async function getCurrentShopId(): Promise<string> {
  const shopId = process.env.DEV_SHOP_ID;
  if (!shopId) {
    throw new Error(
      "No shop context available. Set DEV_SHOP_ID in .env for local development, " +
        "or wire getCurrentShopId() to Clerk's orgId once auth is added."
    );
  }
  return shopId;
}
