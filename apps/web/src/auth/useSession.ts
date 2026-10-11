import { createContext, use } from "react";
import type { LoginInput, RegisterInput, User } from "../api/client";

export type Session = {
  /** The signed-in User, or null when nobody is signed in. */
  user: User | null;
  register: (input: RegisterInput) => Promise<void>;
  login: (input: LoginInput) => Promise<void>;
};

export const SessionContext = createContext<Session | null>(null);

export function useSession(): Session {
  const session = use(SessionContext);
  if (!session) throw new Error("useSession must be used inside <SessionProvider>");
  return session;
}
