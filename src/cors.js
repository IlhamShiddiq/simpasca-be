export function createCorsOptions(origins = '') {
  const allowed = origins.split(',').map((origin) => origin.trim()).filter(Boolean);
  if (allowed.includes('*') && allowed.length !== 1) {
    throw new Error('CORS_ORIGINS: gunakan * saja atau daftar origin, bukan keduanya.');
  }
  for (const origin of allowed.filter((value) => value !== '*')) {
    let url;
    try { url = new URL(origin); } catch { /* Validated below. */ }
    if (!url || !['http:', 'https:'].includes(url.protocol) || url.origin !== origin) {
      throw new Error(`CORS_ORIGINS tidak valid: ${origin}. Gunakan origin HTTP(S) tanpa path atau trailing slash.`);
    }
  }
  return {
    origin: allowed[0] === '*' ? '*' : allowed,
    methods: ['GET', 'HEAD', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    credentials: false,
    exposedHeaders: ['Location'],
  };
}