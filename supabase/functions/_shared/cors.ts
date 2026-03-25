const ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:3000',
  'https://main.d1ffmn4l2are9f.amplifyapp.com',
];

const PREVIEW_PATTERNS = [
  /^https:\/\/[a-z0-9-]+\.d1ffmn4l2are9f\.amplifyapp\.com$/i,
];

function isAllowed(origin: string): boolean {
  if (!origin) return false;
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  return PREVIEW_PATTERNS.some((p) => p.test(origin));
}

export function getCorsHeaders(req?: Request): Record<string, string> {
  const origin = req?.headers?.get('origin') || '';
  return {
    'Access-Control-Allow-Origin': isAllowed(origin) ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  };
}

export function handleCorsOptions(req: Request): Response | null {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: getCorsHeaders(req) });
  }
  return null;
}
