export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);
  if (error.code === '23505') {
    return res.status(409).json({ message: 'request_key sudah digunakan.' });
  }
  if (error.code === '23503') {
    return res.status(422).json({ message: 'created_by tidak ditemukan di tabel users.' });
  }
  if (error.type === 'entity.parse.failed') {
    return res.status(400).json({ message: 'Body harus berupa JSON yang valid.' });
  }
  const status = error.status || 500;
  if (status >= 500) console.error(error);
  res.status(status).json({ message: status >= 500 ? 'Terjadi kesalahan server.' : error.message });
}