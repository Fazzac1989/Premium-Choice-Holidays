'use server';

/**
 * Premium Staycations — Phase 1
 * Task queue actions. Staff-writable by policy; RLS enforces.
 */

import { revalidatePath } from 'next/cache';
import { createUserClient } from '@/lib/supabase/server';

export async function resolveTask(
  taskId: string,
  outcome: 'done' | 'dismissed',
  note: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!note.trim()) {
    return { ok: false, error: 'A resolution needs a note — the queue is an audit trail.' };
  }

  const supabase = await createUserClient();
  const profile = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from('tasks')
    .update({
      status: outcome,
      resolved_at: new Date().toISOString(),
      resolved_by: profile.data.user?.id ?? null,
      resolution_note: note,
    })
    .eq('id', taskId)
    .eq('status', 'open')
    .select('id');
  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) {
    return { ok: false, error: 'The task is no longer open.' };
  }

  revalidatePath('/tasks');
  return { ok: true };
}
