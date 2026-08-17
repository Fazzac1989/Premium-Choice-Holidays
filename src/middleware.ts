/**
 * Premium Staycations — Phase 2a
 * Session refresh and the admin gate.
 *
 * The public customer site lives at /en and /ar and needs no session. The
 * admin UI lives under /admin and requires one. The role split (operator vs
 * admin) is still not enforced here — RLS is the enforcement, and the UI
 * merely hides what a role cannot use.
 *
 * The customer site holds to the Phase 1 rule that `anon` has no grants:
 * public pages read and write only through server code, so there is nothing
 * for an unauthenticated browser to reach directly.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // getUser(), not getSession() — getSession() trusts the cookie unverified.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isAdmin = pathname === '/admin' || pathname.startsWith('/admin/');
  const isLogin = pathname.startsWith('/login');

  if (isAdmin && !user) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  if (isLogin && user) {
    const url = request.nextUrl.clone();
    url.pathname = '/admin';
    url.search = '';
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  // Everything except static assets and Next internals. Public pages still
  // pass through so an admin browsing the site keeps their session fresh.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.svg$).*)'],
};
