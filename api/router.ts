import { createRouter, publicQuery } from "./middleware";
import { authRouter } from "./authRouter";
import { pricingRouter } from "./pricingRouter";

export const appRouter = createRouter({
  ping: publicQuery.query(() => ({ ok: true, ts: Date.now() })),
  auth: authRouter,
  pricing: pricingRouter,
});

export type AppRouter = typeof appRouter;
