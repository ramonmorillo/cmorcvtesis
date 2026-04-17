import type { AuthError, Session, User } from '@supabase/supabase-js';

import { supabase } from '../lib/supabase';

export type AuthResult = {
  user: User | null;
  session: Session | null;
  error: AuthError | Error | null;
};

export async function signInWithPassword(email: string, password: string): Promise<AuthResult> {
  if (!supabase) {
    return {
      user: null,
      session: null,
      error: new Error('Supabase no está configurado en variables de entorno.'),
    };
  }

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  return {
    user: data.user,
    session: data.session,
    error,
  };
}

export async function signOut(): Promise<{ error: AuthError | null }> {
  if (!supabase) {
    return { error: null };
  }

  return supabase.auth.signOut();
}
