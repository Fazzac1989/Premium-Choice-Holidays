import Link from 'next/link';
import { createUserClient } from '@/lib/supabase/server';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default async function DashboardPage() {
  const supabase = await createUserClient();

  const [openTasks, urgentTasks, bookings, quotes] = await Promise.all([
    supabase.from('tasks').select('id', { count: 'exact', head: true }).eq('status', 'open'),
    supabase
      .from('tasks')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'open')
      .eq('priority', 'urgent'),
    supabase.from('bookings').select('id', { count: 'exact', head: true }),
    supabase.from('quotes').select('id', { count: 'exact', head: true }),
  ]);

  const tiles = [
    { label: 'Open tasks', value: openTasks.count ?? 0, href: '/tasks' },
    { label: 'Urgent tasks', value: urgentTasks.count ?? 0, href: '/tasks' },
    { label: 'Bookings', value: bookings.count ?? 0, href: '/bookings' },
    { label: 'Quotes', value: quotes.count ?? 0, href: '/quotes' },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map((tile) => (
          <Link key={tile.label} href={tile.href}>
            <Card className="transition-colors hover:bg-accent/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {tile.label}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <span className="text-3xl font-semibold">{tile.value}</span>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
