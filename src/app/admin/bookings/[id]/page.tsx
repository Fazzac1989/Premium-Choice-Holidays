import { notFound } from 'next/navigation';
import { createUserClient } from '@/lib/supabase/server';
import { formatAED, formatDate, formatDateTime, humanise } from '@/lib/format';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { BookingControls } from './booking-controls';
import { ReissueVoucherButton } from './reissue-voucher-button';

interface PayableLine {
  description: string;
  descriptionAr: string;
  amount: number;
}

export default async function BookingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createUserClient();

  const { data: booking } = await supabase
    .from('bookings')
    .select(
      `*,
       booking_guests(*),
       payments(*),
       external_bookings(*),
       vouchers(*),
       tasks(id, type, priority, status, summary)`,
    )
    .eq('id', id)
    .maybeSingle();
  if (!booking) notFound();

  const payable = (booking.payable_at_property_breakdown ?? []) as unknown as PayableLine[];
  const openTasks = booking.tasks.filter((t) => t.status === 'open');
  const activeVouchers = booking.vouchers.filter((v) => v.superseded_at === null);
  const supersededVouchers = booking.vouchers.filter((v) => v.superseded_at !== null);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-mono text-2xl font-semibold">{booking.reference}</h1>
        <Badge
          variant={
            booking.status === 'confirmed'
              ? 'default'
              : booking.status === 'failed_rollback'
                ? 'destructive'
                : 'secondary'
          }
        >
          {humanise(booking.status)}
        </Badge>
      </div>

      <BookingControls
        bookingId={booking.id}
        status={booking.status}
        totalSell={booking.total_sell}
      />

      {openTasks.length > 0 && (
        <Card className="border-destructive/50">
          <CardHeader><CardTitle className="text-base">Open tasks</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-sm">
            {openTasks.map((task) => (
              <p key={task.id}>
                <Badge variant={task.priority === 'urgent' ? 'destructive' : 'secondary'}>
                  {humanise(task.type)}
                </Badge>{' '}
                {task.summary}
              </p>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Stay</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p>
              {formatDate(booking.check_in)} → {formatDate(booking.check_out)}
            </p>
            <p>
              Total {formatAED(booking.total_sell)} · cost {formatAED(booking.total_cost)} ·
              paid {formatAED(booking.amount_paid)}
            </p>
            {booking.free_cancel_until && (
              <p>Free cancellation until {formatDateTime(booking.free_cancel_until)}</p>
            )}
            {payable.length > 0 && (
              <div className="mt-2 rounded-md border p-2">
                <p className="font-medium">
                  Payable at the property — {formatAED(booking.payable_at_property)}
                </p>
                {payable.map((line, index) => (
                  <div key={index} className="mt-1">
                    <p>{line.description}</p>
                    <p dir="rtl" className="text-muted-foreground">{line.descriptionAr}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Guests</CardTitle></CardHeader>
          <CardContent>
            <ul className="space-y-1 text-sm">
              {booking.booking_guests.map((guest) => (
                <li key={guest.id}>
                  {guest.full_name}
                  {guest.is_lead && <Badge variant="outline" className="ms-2">lead</Badge>}
                  {guest.date_of_birth && (
                    <span className="text-muted-foreground"> · born {formatDate(guest.date_of_birth)}</span>
                  )}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Supplier bookings</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Reference</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Attempt</TableHead>
                <TableHead>Tax treatment</TableHead>
                <TableHead className="text-right">Net cost</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {booking.external_bookings.map((external) => (
                <TableRow key={external.id}>
                  <TableCell className="font-mono">{external.supplier_ref}</TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        external.status === 'confirmed'
                          ? 'default'
                          : external.status === 'cancelled'
                            ? 'outline'
                            : 'destructive'
                      }
                    >
                      {external.status}
                    </Badge>
                  </TableCell>
                  <TableCell>{external.attempt}</TableCell>
                  <TableCell>
                    {external.net_rate_tax_inclusive === null ? (
                      <Badge variant="destructive">unknown</Badge>
                    ) : external.net_rate_tax_inclusive ? (
                      'inclusive'
                    ) : (
                      'exclusive'
                    )}
                  </TableCell>
                  <TableCell className="text-right">{formatAED(external.net_cost)}</TableCell>
                </TableRow>
              ))}
              {booking.external_bookings.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-muted-foreground">
                    No supplier records yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Payments</CardTitle></CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              {booking.payments.map((payment) => (
                <li key={payment.id} className="flex items-center gap-2">
                  <Badge variant={payment.direction === 'in' ? 'default' : 'destructive'}>
                    {payment.direction === 'in' ? 'received' : 'refund initiated'}
                  </Badge>
                  <span>{formatAED(payment.amount)}</span>
                  <span className="text-muted-foreground">{payment.method}</span>
                  {!payment.reconciled && <Badge variant="outline">unreconciled</Badge>}
                </li>
              ))}
              {booking.payments.length === 0 && (
                <li className="text-muted-foreground">No payments recorded.</li>
              )}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Vouchers</CardTitle></CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              {activeVouchers.map((voucher) => (
                <li key={voucher.id} className="flex items-center gap-2">
                  <span className="font-mono">{voucher.code}</span>
                  <Badge variant="outline">{voucher.redemption_method}</Badge>
                  <ReissueVoucherButton voucherId={voucher.id} />
                </li>
              ))}
              {supersededVouchers.map((voucher) => (
                <li key={voucher.id} className="text-muted-foreground line-through">
                  <span className="font-mono">{voucher.code}</span> superseded
                </li>
              ))}
              {booking.vouchers.length === 0 && (
                <li className="text-muted-foreground">No vouchers.</li>
              )}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
