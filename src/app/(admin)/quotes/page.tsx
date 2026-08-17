import Link from 'next/link';
import { createUserClient } from '@/lib/supabase/server';
import { formatAED, formatDate, humanise } from '@/lib/format';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';

export default async function QuotesPage() {
  const supabase = await createUserClient();
  const { data: quotes } = await supabase
    .from('quotes')
    .select('id, status, total_sell, payable_at_property, margin_pct, valid_until, created_at')
    .order('created_at', { ascending: false })
    .limit(100);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Quotes</h1>
        <Button render={<Link href="/quotes/new">New quote</Link>} />
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Created</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Total</TableHead>
            <TableHead className="text-right">At property</TableHead>
            <TableHead className="text-right">Margin</TableHead>
            <TableHead>Valid until</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {(quotes ?? []).map((quote) => (
            <TableRow key={quote.id}>
              <TableCell>
                <Link href={`/quotes/${quote.id}`} className="underline-offset-2 hover:underline">
                  {formatDate(quote.created_at)}
                </Link>
              </TableCell>
              <TableCell><Badge variant="secondary">{humanise(quote.status)}</Badge></TableCell>
              <TableCell className="text-right">{formatAED(quote.total_sell)}</TableCell>
              <TableCell className="text-right">{formatAED(quote.payable_at_property)}</TableCell>
              <TableCell className="text-right">
                {quote.margin_pct !== null ? `${quote.margin_pct}%` : '—'}
              </TableCell>
              <TableCell>{formatDate(quote.valid_until)}</TableCell>
            </TableRow>
          ))}
          {(quotes ?? []).length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="text-muted-foreground">
                No quotes yet.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
