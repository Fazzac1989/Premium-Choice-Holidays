import { createUserClient, currentProfile } from '@/lib/supabase/server';
import { formatDate } from '@/lib/format';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { BrandForm, MarkupRuleForm, StringEditor } from './settings-forms';

export default async function SettingsPage() {
  const [supabase, profile] = await Promise.all([createUserClient(), currentProfile()]);
  const isAdmin = profile?.role === 'admin';

  const [{ data: brands }, { data: markupRules }, { data: strings }] = await Promise.all([
    supabase.from('brands').select('*').order('created_at'),
    supabase
      .from('markup_rules')
      .select('*')
      .order('sourcing')
      .order('effective_from', { ascending: false }),
    supabase.from('strings').select('*').order('key'),
  ]);

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold">Settings</h1>

      <Card>
        <CardHeader><CardTitle>Brands</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Slug</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Domain</TableHead>
                <TableHead className="text-right">Margin floor</TableHead>
                <TableHead className="text-right">Rounding</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(brands ?? []).map((brand) => (
                <TableRow key={brand.id}>
                  <TableCell className="font-mono">{brand.slug}</TableCell>
                  <TableCell>{brand.name}</TableCell>
                  <TableCell>{brand.domain}</TableCell>
                  <TableCell className="text-right">{brand.margin_floor_pct}%</TableCell>
                  <TableCell className="text-right">AED {brand.rounding_increment}</TableCell>
                </TableRow>
              ))}
              {(brands ?? []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-muted-foreground">
                    No brand yet — quotes cannot be assembled until one exists.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          {isAdmin && <BrandForm />}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Markup rules</CardTitle>
          <p className="text-sm text-muted-foreground">
            Effective-dated. A new rule closes its incumbent the day before it
            starts; nothing is edited in place, so historic quotes stay
            explainable.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Sourcing</TableHead>
                <TableHead>Product type</TableHead>
                <TableHead className="text-right">Markup</TableHead>
                <TableHead>Effective</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {(markupRules ?? []).map((rule) => {
                const live = rule.effective_to === null;
                return (
                  <TableRow key={rule.id} className={live ? '' : 'text-muted-foreground'}>
                    <TableCell>{rule.sourcing}</TableCell>
                    <TableCell>{rule.product_type ?? 'all types'}</TableCell>
                    <TableCell className="text-right">{rule.markup_pct}%</TableCell>
                    <TableCell>
                      {formatDate(rule.effective_from)} →{' '}
                      {rule.effective_to ? formatDate(rule.effective_to) : 'open'}
                    </TableCell>
                    <TableCell>{live && <Badge variant="outline">live</Badge>}</TableCell>
                  </TableRow>
                );
              })}
              {(markupRules ?? []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-muted-foreground">
                    No markup rules. Assembly will refuse to price anything
                    without an explicit sell price.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          {isAdmin && (brands ?? []).length > 0 && (
            <MarkupRuleForm brandId={(brands ?? [])[0].id} />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Strings</CardTitle>
          <p className="text-sm text-muted-foreground">
            Locked legal copy rejects every direct edit, service key included —
            edits go through <code>admin_update_locked_string()</code> and land
            in the audit log.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {(strings ?? []).map((row) => (
            <StringEditor
              key={row.key}
              stringKey={row.key}
              en={row.en}
              ar={row.ar}
              locked={row.locked}
              canEdit={isAdmin}
            />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
