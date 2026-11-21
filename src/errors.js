export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);
  if (error.status === 401) res.set('WWW-Authenticate', 'Bearer');
  if (error.code === '23505') {
    return res.status(409).json({ message: 'Nilai unik (request_key, username, atau pasangan relasi) sudah digunakan.' });
  }
  if (error.code === '23503') {
    return res.status(req.method === 'DELETE' ? 409 : 422).json({ message: req.method === 'DELETE'
      ? 'Data masih digunakan oleh data lain dan tidak dapat dihapus.'
      : 'Referensi relasi tidak ditemukan.' });
  }
  if (['23514', '23502', '22003', '22007', '22008', '22P02', '22001'].includes(error.code)) {
    return res.status(422).json({ message: 'Data tidak memenuhi constraint atau format database.' });
  }
  if (error.type === 'entity.parse.failed') {
    return res.status(400).json({ message: 'Body harus berupa JSON yang valid.' });
  }
  const status = error.status || 500;
  if (status >= 500) console.error(error);
  res.status(status).json({ message: status >= 500 ? 'Terjadi kesalahan server.' : error.message });
}