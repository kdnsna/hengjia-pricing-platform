import type { FetchCreateContextFnOptions } from "@trpc/server/adapters/fetch";
import type { AccessUser } from "@contracts/access";
import { authenticateUser } from "./access";

export type TrpcContext = {
  req: Request;
  resHeaders: Headers;
  user?: AccessUser;
};

export async function createContext(
  opts: FetchCreateContextFnOptions,
): Promise<TrpcContext> {
  const user = await authenticateUser(opts.req.headers);
  return { req: opts.req, resHeaders: opts.resHeaders, user: user ?? undefined };
}
