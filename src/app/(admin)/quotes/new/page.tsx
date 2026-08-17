import { createUserClient } from '@/lib/supabase/server';
import { loadExtraSelections } from '@/lib/assembly/loaders';
import { QuoteBuilder, type ExtraOption, type PropertyOption } from './quote-builder';

export default async function NewQuotePage() {
  const supabase = await createUserClient();

  const [{ data: properties }, selections] = await Promise.all([
    supabase
      .from('properties')
      .select('id, name, emirate, area, star_rating')
      .order('name'),
    loadExtraSelections(supabase),
  ]);

  const propertyOptions: PropertyOption[] = (properties ?? []).map((p) => ({
    id: p.id,
    label: `${p.name} (${p.emirate}${p.star_rating ? `, ${p.star_rating}★` : ''})`,
  }));

  const extraOptions: ExtraOption[] = selections.map((s) => ({
    rateId: s.rate.id,
    label: s.product.name,
    sell: s.rate.sell_price,
    validFrom: s.rate.valid_from,
    validTo: s.rate.valid_to,
  }));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">New quote</h1>
      {propertyOptions.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          The properties cache is empty. Run a sync from the Properties screen first.
        </p>
      ) : (
        <QuoteBuilder properties={propertyOptions} extras={extraOptions} />
      )}
    </div>
  );
}
