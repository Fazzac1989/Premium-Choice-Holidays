import Link from 'next/link';
import { createUserClient } from '@/lib/supabase/server';
import { formatAED, formatDate, humanise } from '@/lib/format';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  confirmed: 'default',
  failed_rollback: 'destructive',
  cancelled: 'outline',
  refunded: 'outline',
};

export default async function BookingsPage() {
  const supabase = await createUserClient();
  const { data: bookings } = await supabase
    .from('bookings')
    .select('id, reference, status, check_in, check_out, total_sell, amount_paid, created_at')
    .order('created_at', { ascending: false })
    .limit(100);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Bookings</h1>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Reference</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Stay</TableHead>
            <TableHead className="text-right">Total</TableHead>
            <TableHead className="text-right">Paid</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {(bookings ?? []).map((booking) => (
            <TableRow key={booking.id}>
              <TableCell>
                <Link
                  href={`/bookings/${booking.id}`}
                  className="font-mono underline-offset-2 hover:underline"
                >
                  {booking.reference}
                </Link>
              </TableCell>
              <TableCell>
                <Badge variant={STATUS_VARIANT[booking.status] ?? 'secondary'}>
                  {humanise(booking.status)}
                </Badge>
              </TableCell>
              <TableCell>
                {formatDate(booking.check_in)} → {formatDate(booking.check_out)}
              </TableCell>
              <TableCell className="text-right">{formatAED(booking.total_sell)}</TableCell>
              <TableCell className="text-right">{formatAED(booking.amount_paid)}</TableCell>
            </TableRow>
          ))}
          {(bookings ?? []).length === 0 && (
            <TableRow>
              <TableCell colSpan={5} className="text-muted-foreground">
                No bookings yet. Bookings are created from a quote.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
