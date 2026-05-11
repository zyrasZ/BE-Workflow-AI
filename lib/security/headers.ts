import { NextResponse } from 'next/server';

export interface SecurityHeaders {
  'Content-Security-Policy'?: string;
  'X-Frame-Options'?: string;
  'X-Content-Type-Options'?: string;
  'Referrer-Policy'?: string;
  'Permissions-Policy'?: string;
  'Strict-Transport-Security'?: string;
  'X-XSS-Protection'?: string;
}

/**
 * Security headers configuration for production
 */
export const SECURITY_HEADERS: SecurityHeaders = {
  // Content Security Policy - Prevent XSS attacks
  // Relaxed for OAuth and frontend integration
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://vercel.live https://accounts.google.com https://apis.google.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://accounts.google.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: https: blob:",
    "connect-src 'self' https://*.supabase.co https://api.openai.com https://api.groq.com https://generativelanguage.googleapis.com https://accounts.google.com https://oauth2.googleapis.com",
    "frame-src 'self' https://accounts.google.com",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self' https://accounts.google.com",
    "upgrade-insecure-requests"
  ].join('; '),

  // Prevent clickjacking attacks
  'X-Frame-Options': 'DENY',

  // Prevent MIME type sniffing
  'X-Content-Type-Options': 'nosniff',

  // Control referrer information
  'Referrer-Policy': 'strict-origin-when-cross-origin',

  // Control browser features
  'Permissions-Policy': [
    'camera=()',
    'microphone=()',
    'geolocation=()',
    'payment=()',
    'usb=()',
    'magnetometer=()',
    'gyroscope=()',
    'accelerometer=()'
  ].join(', '),

  // Force HTTPS (only in production)
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',

  // XSS Protection (legacy but still useful)
  'X-XSS-Protection': '1; mode=block'
};

/**
 * Apply security headers to a response
 */
export function applySecurityHeaders(response: NextResponse): NextResponse {
  // Only apply HSTS in production
  const headers = { ...SECURITY_HEADERS };
  if (process.env.NODE_ENV !== 'production') {
    delete headers['Strict-Transport-Security'];
  }

  Object.entries(headers).forEach(([key, value]) => {
    if (value) {
      response.headers.set(key, value);
    }
  });

  return response;
}

/**
 * Create a response with security headers
 */
export function createSecureResponse(
  body?: BodyInit | null,
  init?: ResponseInit
): NextResponse {
  const response = new NextResponse(body, init);
  return applySecurityHeaders(response);
}

/**
 * CORS configuration
 */
export interface CORSConfig {
  allowedOrigins: string[];
  allowedMethods: string[];
  allowedHeaders: string[];
  maxAge: number;
}

export const CORS_CONFIG: CORSConfig = {
  allowedOrigins: ['*'],
  allowedMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'Accept',
    'Origin'
  ],
  maxAge: 86400 // 24 hours
};

/**
 * Apply CORS headers to a response
 */
export function applyCORSHeaders(
  response: NextResponse,
  origin?: string
): NextResponse {
  const { allowedOrigins, allowedMethods, allowedHeaders, maxAge } = CORS_CONFIG;

  // When credentials are used, we must return the specific origin, not '*'
  // Allow all origins by reflecting the request origin
  if (origin) {
    response.headers.set('Access-Control-Allow-Origin', origin);
  } else if (allowedOrigins.includes('*')) {
    // Fallback to * only if no origin is provided (shouldn't happen in practice)
    response.headers.set('Access-Control-Allow-Origin', '*');
  }

  response.headers.set('Access-Control-Allow-Methods', allowedMethods.join(', '));
  response.headers.set('Access-Control-Allow-Headers', allowedHeaders.join(', '));
  response.headers.set('Access-Control-Max-Age', maxAge.toString());
  response.headers.set('Access-Control-Allow-Credentials', 'true');

  return response;
}

/**
 * Handle CORS preflight requests
 */
export function handleCORSPreflight(request: Request): NextResponse | null {
  if (request.method !== 'OPTIONS') {
    return null;
  }

  const origin = request.headers.get('Origin');
  const response = new NextResponse(null, { status: 200 });
  
  return applyCORSHeaders(response, origin || undefined);
}