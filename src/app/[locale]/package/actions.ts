'use server';

/**
 * Premium Staycations — Phase 2a
 * The enquiry write — one of the funnel's three public writes.
 *
 * Runs on the service client because anon holds no grants; zod is the gate.
 * An enquiry from a blocked package is the pricing engine's refusal turned
 * into a lead instead of a lost customer.
 */

import { z } from 'zod';
import { createServiceClient } from '@/lib/supabase/service';

const enquirySchema = z.object({
  fullName: z.string().min(1).max(200),
  email: z.string().email().max(320),
  phone: z.string().max(40).optional(),
  propertyId: z.string().uuid(),
  checkIn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  checkOut: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  adults: z.number().int().min(1).max(8),
  children: z.number().int().min(0).max(8),
  rooms: z.number().int().min(1).max(4),
  propertyName: z.string().max(300),
});

export async function submitEnquiry(
  input: z.infer<typeof enquirySchema>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = enquirySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Invalid enquiry.' };
  const enquiry = parsed.data;

  const service = createServiceClient();

  const { data: brand } = await service.from('brands').select('id').limit(1).maybeSingle();
  if (!brand) return { ok: false, error: 'Not accepting enquiries yet.' };

  const { data: property } = await service
    .from('properties')
    .select('id, emirate')
    .eq('id', enquiry.propertyId)
    .maybeSingle();
  if (!property) return { ok: false, error: 'Unknown property.' };

  const { data: customer, error: customerError } = await service
    .from('customers')
    .upsert(
      {
        brand_id: brand.id,
        email: enquiry.email,
        full_name: enquiry.fullName,
        phone: enquiry.phone ?? null,
      },
      { onConflict: 'brand_id,email' },
    )
    .select('id')
    .single();
  if (customerError) return { ok: false, error: 'Could not record your details.' };

  const { error } = await service.from('enquiries').insert({
    brand_id: brand.id,
    customer_id: customer.id,
    source: 'web:package_blocked',
    emirate: property.emirate,
    travel_start: enquiry.checkIn,
    travel_end: enquiry.checkOut,
    adults: enquiry.adults,
    children: enquiry.children,
    rooms: enquiry.rooms,
    requirements: `Blocked online package: ${enquiry.propertyName}`,
    owner: 'human:reservations',
  });
  if (error) return { ok: false, error: 'Could not send the enquiry.' };

  return { ok: true };
}
