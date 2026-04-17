import { supabase } from '../lib/supabase';

export type User = {
  id: string;
  email?: string;
};

export type Session = {
  access_token: string;
  refresh_token: string;
};

export type AuthError = Error;

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
    user: (data?.user as User | null) ?? null,
    session: (data?.session as Session | null) ?? null,
    error,
  };
}

export async function signOut(): Promise<{ error: AuthError | null }> {
  if (!supabase) {
    return { error: null };
  }

  const { error } = await supabase.auth.signOut();
  return { error };
}
