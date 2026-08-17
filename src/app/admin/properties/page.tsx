import { createUserClient, currentProfile } from '@/lib/supabase/server';
import { formatDateTime } from '@/lib/format';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { SyncPropertiesButton } from './sync-button';

export default async function PropertiesPage() {
  const [supabase, profile] = await Promise.all([createUserClient(), currentProfile()]);

  const { data: properties } = await supabase
    .from('properties')
    .select('*')
    .order('emirate')
    .order('name');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Properties</h1>
          <p className="text-sm text-muted-foreground">
            Read-only supplier cache. Local copy belongs in overrides and
            survives a refresh.
          </p>
        </div>
        {profile?.role === 'admin' && <SyncPropertiesButton />}
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Emirate</TableHead>
            <TableHead>Area</TableHead>
            <TableHead>Stars</TableHead>
            <TableHead>Check-in</TableHead>
            <TableHead>Cached</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {(properties ?? []).map((property) => (
            <TableRow key={property.id}>
              <TableCell>
                {property.name}
                {property.external_property_id.startsWith('SCN-') && (
                  <Badge variant="outline" className="ms-2">scenario</Badge>
                )}
              </TableCell>
              <TableCell>{property.emirate}</TableCell>
              <TableCell>{property.area ?? '—'}</TableCell>
              <TableCell>
                {property.star_rating ?? <Badge variant="destructive">missing</Badge>}
              </TableCell>
              <TableCell>{property.check_in_time?.slice(0, 5) ?? 'brand default'}</TableCell>
              <TableCell className="text-muted-foreground">
                {formatDateTime(property.cached_at)}
              </TableCell>
            </TableRow>
          ))}
          {(properties ?? []).length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="text-muted-foreground">
                The cache is empty. Sync from the supplier to load it.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
