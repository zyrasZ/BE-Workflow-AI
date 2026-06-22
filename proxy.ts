import { NextRequest, NextResponse } from 'next/server';
import { applySecurityHeaders, applyCORSHeaders, handleCORSPreflight } from '@/lib/security/headers';

export function proxy(request: NextRequest) {
  // Handle CORS preflight requests
  const corsResponse = handleCORSPreflight(request);
  if (corsResponse) {
    return applySecurityHeaders(corsResponse);
  }

  // Get origin for CORS
  const origin = request.headers.get('Origin');

  // Continue with the request
  const response = NextResponse.next();

  // Apply security headers
  applySecurityHeaders(response);

  // Apply CORS headers for API routes
  if (request.nextUrl.pathname.startsWith('/api/')) {
    applyCORSHeaders(response, origin || undefined);
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    '/((?!_next/static|_next/image|favicon.ico|public/).*)',
  ],
};
