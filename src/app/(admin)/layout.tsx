import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentProfile } from '@/lib/supabase/server';
import { Badge } from '@/components/ui/badge';
import { SignOutButton } from './sign-out-button';

const NAV = [
  { href: '/tasks', label: 'Tasks' },
  { href: '/bookings', label: 'Bookings' },
  { href: '/quotes', label: 'Quotes' },
  { href: '/properties', label: 'Properties' },
  { href: '/extras', label: 'Extras' },
  { href: '/settings', label: 'Settings' },
];

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await currentProfile();
  // The middleware already gates on a session; this catches a user whose
  // profile was deactivated after sign-in.
  if (!profile) redirect('/login');

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-56 shrink-0 flex-col border-e bg-muted/30">
        <div className="border-b p-4">
          <Link href="/" className="font-semibold">
            Premium Staycations
          </Link>
          <p className="text-xs text-muted-foreground">Phase 1 admin</p>
        </div>
        <nav className="flex-1 space-y-1 p-2">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="block rounded-md px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="space-y-2 border-t p-4">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm">{profile.fullName ?? profile.email}</span>
            <Badge variant={profile.role === 'admin' ? 'default' : 'secondary'}>
              {profile.role}
            </Badge>
          </div>
          <SignOutButton />
        </div>
      </aside>
      <main className="flex-1 overflow-x-auto p-6">{children}</main>
    </div>
  );
}
