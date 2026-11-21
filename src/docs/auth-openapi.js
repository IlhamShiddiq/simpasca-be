export function addAuthDocs(openapi) {
  openapi.components.securitySchemes = { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } };
  openapi.security = [{ bearerAuth: [] }];
  openapi.paths['/health'].get.security = [];
  openapi.tags.push({ name: 'Auth', description: 'Login JWT, logout dengan pencabutan token, dan profil pengguna.' });
  const json = (schema) => ({ 'application/json': { schema } });
  const error = { description: 'Token tidak valid atau kredensial salah.', content: json({ $ref: '#/components/schemas/Error' }) };
  const user = { $ref: '#/components/schemas/Users' };
  openapi.paths['/api/auth/login'] = {
    post: {
      tags: ['Auth'], operationId: 'login', summary: 'Login menggunakan username dan password', security: [],
      requestBody: { required: true, content: json({
        type: 'object', additionalProperties: false, required: ['username', 'password'],
        properties: { username: { type: 'string', maxLength: 100 }, password: { type: 'string', format: 'password', maxLength: 256 } },
      }) },
      responses: {
        200: { description: 'JWT berlaku selama expires_in detik.', content: json({
          type: 'object', properties: { data: { type: 'object', properties: {
            access_token: { type: 'string' }, token_type: { type: 'string', enum: ['Bearer'] }, expires_in: { type: 'integer' }, user,
          } } },
        }) }, 401: error, 422: { ...error, description: 'Input login tidak valid.' },
      },
    },
  };
  openapi.paths['/api/auth/me'] = { get: {
    tags: ['Auth'], operationId: 'getMe', summary: 'Profil user dari Bearer token',
    responses: { 200: { description: 'Profil terbaru tanpa password/hash.', content: json({ type: 'object', properties: { data: user } }) }, 401: error },
  } };
  openapi.paths['/api/auth/logout'] = { post: {
    tags: ['Auth'], operationId: 'logout', summary: 'Cabut JWT yang sedang digunakan',
    description: 'Token ini tidak dapat digunakan lagi. Token login lain tetap berlaku.',
    responses: { 204: { description: 'Logout berhasil; tanpa body.' }, 401: error },
  } };
  for (const [path, item] of Object.entries(openapi.paths)) {
    if (path === '/health' || path === '/api/auth/login') continue;
    for (const method of ['get', 'post', 'patch', 'delete']) {
      if (item[method]) item[method].responses[401] = error;
    }
  }
}