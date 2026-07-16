import type { JwtPayload } from "../lib/auth";
import type { User } from "../lib/db/queries";

declare module "h3" {
  interface H3EventContext {
    authUser?: JwtPayload;
    eaUser?: User;
  }
}
