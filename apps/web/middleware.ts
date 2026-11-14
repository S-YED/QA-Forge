import { NextResponse, type NextRequest } from 'next/server';
import { createMiddlewareClient } from '@/lib/supabase/middleware';

// Public routes that do NOT require authentication
const PUBLIC_ROUTES = ['/', '/landing', '/login', '/demo'];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public routes to pass through without auth check
  const isPublic = PUBLIC_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(route + '/')
  );

  if (isPublic && !pathname.startsWith('/dashboard')) {
    return NextResponse.next();
  }

  const middlewareClient = createMiddlewareClient(request);
  const { supabase } = middlewareClient;

  // Refresh the session - IMPORTANT: always call getUser() so cookies stay fresh
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Read the response AFTER getUser() so the getter returns the post-refresh value
  const { response } = middlewareClient;

  // Unauthenticated users trying to access /dashboard → redirect to /login
  if (!user && pathname.startsWith('/dashboard')) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    const redirectResponse = NextResponse.redirect(url);
    response.cookies.getAll().forEach((cookie) => {
      redirectResponse.cookies.set(cookie.name, cookie.value);
    });
    return redirectResponse;
  }

  // Authenticated users hitting /login → redirect to /dashboard/projects
  if (user && pathname === '/login') {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard/projects';
    const redirectResponse = NextResponse.redirect(url);
    response.cookies.getAll().forEach((cookie) => {
      redirectResponse.cookies.set(cookie.name, cookie.value);
    });
    return redirectResponse;
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.svg|.*\\.png|.*\\.jpg|.*\\.ico).*)'],
};
