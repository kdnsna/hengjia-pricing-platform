import { ensureAuthSeed } from "../api/access";
import { ensureSeed } from "../api/pricingRouter";
import { getDb } from "../api/queries/connection";

async function seed() {
  try {
    await ensureAuthSeed();
    await ensureSeed();
    console.log("Demo accounts and pricing data are ready.");
  } finally {
    const client = (getDb() as unknown as { $client?: { end?: () => Promise<void> } }).$client;
    await client?.end?.();
  }
}

seed().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
