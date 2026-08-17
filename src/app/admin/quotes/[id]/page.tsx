import { notFound } from 'next/navigation';
import { createUserClient } from '@/lib/supabase/server';
import { formatAED, formatDate, humanise } from '@/lib/format';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { CreateBookingButton } from './create-booking-button';

interface PayableLine {
  description: string;
  descriptionAr: string;
  amount: number;
}

export default async function QuoteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createUserClient();

  const { data: quote } = await supabase
    .from('quotes')
    .select('*, quote_items(*), tasks(id, type, priority, status, summary)')
    .eq('id', id)
    .maybeSingle();
  if (!quote) notFound();

  const { data: bookings } = await supabase
    .from('bookings')
    .select('id, reference, status')
    .eq('quote_id', id);

  const payable = (quote.payable_at_property_breakdown ?? []) as unknown as PayableLine[];
  const blockingTasks = quote.tasks.filter(
    (t) => t.status === 'open' && t.priority === 'urgent',
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Quote</h1>
        <div className="flex items-center gap-2">
          <Badge variant="secondary">{humanise(quote.status)}</Badge>
          {(bookings ?? []).length === 0 && blockingTasks.length === 0 && (
            <CreateBookingButton quoteId={quote.id} />
          )}
        </div>
      </div>

      {blockingTasks.length > 0 && (
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="text-base">Blocked — open urgent tasks</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            {blockingTasks.map((task) => (
              <p key={task.id}>
                <Badge variant="destructive">{humanise(task.type)}</Badge> {task.summary}
              </p>
            ))}
          </CardContent>
        </Card>
      )}

      {(bookings ?? []).map((booking) => (
        <p key={booking.id} className="text-sm">
          Booking{' '}
          <a href={`/admin/bookings/${booking.id}`} className="underline underline-offset-2">
            {booking.reference}
          </a>{' '}
          <Badge variant="secondary">{humanise(booking.status)}</Badge>
        </p>
      ))}

      <Card>
        <CardHeader><CardTitle>Components</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Description</TableHead>
                <TableHead>Dates</TableHead>
                <TableHead>Sourcing</TableHead>
                <TableHead className="text-right">Cost</TableHead>
                <TableHead className="text-right">Sell</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {quote.quote_items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    <p>{item.description}</p>
                    {item.description_ar && (
                      <p dir="rtl" className="text-muted-foreground">{item.description_ar}</p>
                    )}
                  </TableCell>
                  <TableCell>
                    {formatDate(item.date_from)} → {formatDate(item.date_to)}
                  </TableCell>
                  <TableCell><Badge variant="outline">{item.sourcing}</Badge></TableCell>
                  <TableCell className="text-right">{formatAED(item.unit_cost)}</TableCell>
                  <TableCell className="text-right">{formatAED(item.unit_sell)}</TableCell>
                </TableRow>
              ))}
              <TableRow>
                <TableCell colSpan={4} className="text-muted-foreground">
                  Rounding delta (retained as margin)
                </TableCell>
                <TableCell className="text-right">{formatAED(quote.rounding_delta)}</TableCell>
              </TableRow>
              <TableRow className="font-semibold">
                <TableCell colSpan={3}>Total</TableCell>
                <TableCell className="text-right">{formatAED(quote.total_cost)}</TableCell>
                <TableCell className="text-right">{formatAED(quote.total_sell)}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {payable.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>
              Payable at the property — {formatAED(quote.payable_at_property)}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {payable.map((line, index) => (
              <div key={index}>
                <p>{line.description}</p>
                <p dir="rtl" className="text-muted-foreground">{line.descriptionAr}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <p className="text-sm text-muted-foreground">
        Margin {quote.margin_pct !== null ? `${quote.margin_pct}%` : '—'} · valid until{' '}
        {formatDate(quote.valid_until)}
      </p>
    </div>
  );
}
