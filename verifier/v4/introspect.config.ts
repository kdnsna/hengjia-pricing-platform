import "dotenv/config";
import { defineConfig } from "drizzle-kit";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required for read-only introspection");

export default defineConfig({
  schema: "./db/schema.ts",
  out: "./verifier/runs/v4-introspected-after",
  dialect: "mysql",
  dbCredentials: { url: connectionString },
});
