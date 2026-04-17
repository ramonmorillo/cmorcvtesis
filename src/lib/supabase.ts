export type SupabaseEnvStatus = {
  isConfigured: boolean;
  missingVars: Array<'VITE_SUPABASE_URL' | 'VITE_SUPABASE_ANON_KEY'>;
};

type SupabaseLikeResponse<T> = Promise<{ data: T; error: Error | null }>;

type QueryBuilder = {
  select: () => QueryBuilder;
  order: () => SupabaseLikeResponse<unknown[]>;
  eq: () => QueryBuilder;
  maybeSingle: () => SupabaseLikeResponse<unknown | null>;
  insert: () => QueryBuilder;
};

export type SupabaseLikeClient = {
  auth: {
    signInWithPassword: (_credentials: { email: string; password: string }) => SupabaseLikeResponse<{ user: unknown; session: unknown }>;
    signOut: () => SupabaseLikeResponse<null>;
  };
  from: (_table: string) => QueryBuilder;
};

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

const missingVars: SupabaseEnvStatus['missingVars'] = [];

if (!supabaseUrl) {
  missingVars.push('VITE_SUPABASE_URL');
}
if (!supabaseAnonKey) {
  missingVars.push('VITE_SUPABASE_ANON_KEY');
}

export const supabaseEnvStatus: SupabaseEnvStatus = {
  isConfigured: missingVars.length === 0,
  missingVars,
};

function createNotImplementedError(action: string) {
  return new Error(`Operación no disponible localmente sin @supabase/supabase-js: ${action}`);
}

function createFallbackQueryBuilder(table: string): QueryBuilder {
  return {
    select: () => createFallbackQueryBuilder(table),
    order: async () => ({ data: [], error: createNotImplementedError(`from(${table}).order`) }),
    eq: () => createFallbackQueryBuilder(table),
    maybeSingle: async () => ({ data: null, error: createNotImplementedError(`from(${table}).maybeSingle`) }),
    insert: () => createFallbackQueryBuilder(table),
  };
}

function createFallbackClient(): SupabaseLikeClient {
  return {
    auth: {
      signInWithPassword: async () => ({
        data: { user: null, session: null },
        error: createNotImplementedError('auth.signInWithPassword'),
      }),
      signOut: async () => ({ data: null, error: null }),
    },
    from: (table: string) => createFallbackQueryBuilder(table),
  };
}

export const supabase: SupabaseLikeClient | null = supabaseEnvStatus.isConfigured ? createFallbackClient() : null;
