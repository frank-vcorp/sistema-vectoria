import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "@/server/trpc/root";
import { createTrpcContext } from "@/server/trpc/context";

function handler(request: Request) {
  return fetchRequestHandler({ endpoint: "/api/trpc", req: request, router: appRouter, createContext: () => createTrpcContext(request) });
}
export { handler as GET, handler as POST };
