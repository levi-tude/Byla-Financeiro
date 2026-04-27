import type { NextFunction, Request, Response } from 'express';
import { getSupabase } from '../services/supabaseClient.js';
import { isAppRole, type AppRole } from '../auth/roles.js';

const AUTH_ENFORCE = (process.env.BYLA_AUTH_ENFORCE ?? 'true').trim().toLowerCase() === 'true';
const DEFAULT_ROLE = (process.env.BYLA_DEFAULT_ROLE ?? '').trim().toLowerCase();

function getBearerToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (!authHeader) return null;
  const [scheme, token] = authHeader.split(' ');
  if ((scheme ?? '').toLowerCase() !== 'bearer') return null;
  return token?.trim() || null;
}

async function resolveRole(userId: string): Promise<AppRole | null> {
  const supabase = getSupabase();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .maybeSingle();
  if (!error && isAppRole(data?.role)) return data.role;

  if (isAppRole(DEFAULT_ROLE)) return DEFAULT_ROLE;
  return null;
}

export async function attachAuthUser(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const token = getBearerToken(req);
  if (!token) return next();

  const supabase = getSupabase();
  if (!supabase) return next();

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return next();

  const role = await resolveRole(data.user.id);
  if (!role) return next();

  req.authUser = {
    userId: data.user.id,
    email: data.user.email ?? null,
    role,
  };
  next();
}

export function requireRoles(allowedRoles: readonly AppRole[]) {
  return async function guard(req: Request, res: Response, next: NextFunction): Promise<void> {
    if (!req.authUser) {
      if (!AUTH_ENFORCE) return next();
      return void res.status(401).json({ error: 'Autenticação obrigatória.' });
    }
    if (!allowedRoles.includes(req.authUser.role)) {
      return void res.status(403).json({ error: 'Sem permissão para esta operação.' });
    }
    return next();
  };
}
