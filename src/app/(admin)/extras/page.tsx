import { createUserClient } from '@/lib/supabase/server';
import { formatAED, formatDate } from '@/lib/format';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';

export default async function ExtrasPage() {
  const supabase = await createUserClient();

  const { data: products } = await supabase
    .from('products')
    .select('*, product_rates(*, product_rate_child_bands(*)), extra_eligibility(*)')
    .neq('type', 'accommodation')
    .order('name');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Extras</h1>
        <p className="text-sm text-muted-foreground">
          Contracted extras are freesale only in Phase 1 — the schema refuses
          anything else. Catalogue editing lands with the Extras admin screens;
          until then rates are loaded by migration or SQL.
        </p>
      </div>

      {(products ?? []).map((product) => (
        <div key={product.id} className="space-y-2 rounded-lg border p-4">
          <div className="flex items-center gap-2">
            <h2 className="font-medium">{product.name}</h2>
            {product.name_ar ? (
              <span dir="rtl" className="text-muted-foreground">{product.name_ar}</span>
            ) : (
              <Badge variant="outline">no Arabic name</Badge>
            )}
            <Badge variant="secondary">{product.type}</Badge>
            {!product.active && <Badge variant="destructive">inactive</Badge>}
            <span className="ms-auto text-sm text-muted-foreground">
              lead time {product.min_lead_time_hours}h
            </span>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Validity</TableHead>
                <TableHead>Basis</TableHead>
                <TableHead className="text-right">Cost net</TableHead>
                <TableHead className="text-right">Sell</TableHead>
                <TableHead className="text-right">Margin</TableHead>
                <TableHead>Child bands</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {product.product_rates.map((rate) => (
                <TableRow key={rate.id}>
                  <TableCell>
                    {formatDate(rate.valid_from)} → {formatDate(rate.valid_to)}
                  </TableCell>
                  <TableCell>{rate.pricing_basis}</TableCell>
                  <TableCell className="text-right">{formatAED(rate.cost_net)}</TableCell>
                  <TableCell className="text-right">
                    {rate.sell_price !== null ? formatAED(rate.sell_price) : 'markup rule'}
                  </TableCell>
                  <TableCell className="text-right">
                    {rate.sell_price !== null && rate.sell_price > 0
                      ? `${Math.round(((rate.sell_price - rate.cost_net) / rate.sell_price) * 100)}%`
                      : '—'}
                  </TableCell>
                  <TableCell>
                    {rate.product_rate_child_bands.length === 0
                      ? '—'
                      : rate.product_rate_child_bands
                          .map(
                            (band) =>
                              `${band.label ?? 'band'} ${band.age_min}–${band.age_max}: ` +
                              (band.sell_price === 0 ? 'free' : formatAED(band.sell_price)),
                          )
                          .join(' · ')}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <p className="text-xs text-muted-foreground">
            Eligibility:{' '}
            {product.extra_eligibility.length === 0
              ? 'none — attaches nowhere'
              : product.extra_eligibility
                  .map((rule) =>
                    rule.scope === 'any'
                      ? 'anywhere'
                      : rule.scope === 'emirate'
                        ? `emirate: ${rule.emirate}`
                        : rule.scope === 'area'
                          ? `area: ${rule.area}`
                          : `property: ${rule.external_property_id}`,
                  )
                  .join(' · ')}
          </p>
        </div>
      ))}

      {(products ?? []).length === 0 && (
        <p className="text-sm text-muted-foreground">No extras in the catalogue yet.</p>
      )}
    </div>
  );
}
