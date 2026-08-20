import 'server-only'

import { createClient } from '@/lib/supabase/server'
import { SupabaseFoundationReadRepository } from './supabase-repository'

export async function createFoundationReadRepository() {
  return new SupabaseFoundationReadRepository(await createClient())
}
