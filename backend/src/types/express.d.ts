import type { AuthUserContext } from '../auth/roles.js';

declare global {
  namespace Express {
    interface Request {
      requestId?: string;
      authUser?: AuthUserContext;
    }
  }
}

export {};
