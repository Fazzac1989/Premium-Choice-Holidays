import Link from 'next/link';
import { createUserClient } from '@/lib/supabase/server';
import { formatDateTime, humanise } from '@/lib/format';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { ResolveTaskButtons } from './resolve-task-buttons';

export default async function TasksPage() {
  const supabase = await createUserClient();

  // The open queue, urgent first, oldest first within a priority — the same
  // order as the partial index that serves it.
  const { data: tasks } = await supabase
    .from('tasks')
    .select('*, bookings(reference)')
    .eq('status', 'open')
    .order('priority', { ascending: true }) // enum order: urgent, normal, low
    .order('created_at', { ascending: true });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Task queue</h1>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Priority</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Summary</TableHead>
            <TableHead>Booking</TableHead>
            <TableHead>Raised</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {(tasks ?? []).map((task) => (
            <TableRow key={task.id}>
              <TableCell>
                <Badge variant={task.priority === 'urgent' ? 'destructive' : 'secondary'}>
                  {task.priority}
                </Badge>
              </TableCell>
              <TableCell>{humanise(task.type)}</TableCell>
              <TableCell className="max-w-xl">
                <p>{task.summary}</p>
                {task.context !== null && (
                  <details className="text-xs text-muted-foreground">
                    <summary className="cursor-pointer">context</summary>
                    <pre className="mt-1 overflow-x-auto rounded bg-muted p-2">
                      {JSON.stringify(task.context, null, 2)}
                    </pre>
                  </details>
                )}
              </TableCell>
              <TableCell>
                {task.booking_id && task.bookings ? (
                  <Link
                    href={`/bookings/${task.booking_id}`}
                    className="font-mono underline-offset-2 hover:underline"
                  >
                    {task.bookings.reference}
                  </Link>
                ) : task.quote_id ? (
                  <Link
                    href={`/quotes/${task.quote_id}`}
                    className="underline-offset-2 hover:underline"
                  >
                    quote
                  </Link>
                ) : (
                  '—'
                )}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {formatDateTime(task.created_at)}
              </TableCell>
              <TableCell>
                <ResolveTaskButtons taskId={task.id} />
              </TableCell>
            </TableRow>
          ))}
          {(tasks ?? []).length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="text-muted-foreground">
                The queue is empty.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
