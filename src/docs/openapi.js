import { addResourceDocs } from './resource-openapi.js';
import { addAuthDocs } from './auth-openapi.js';

const ref = (name) => ({ $ref: `#/components/schemas/${name}` });
const json = (schema) => ({ 'application/json': { schema } });
const response = (description, schema) => ({ description, ...(schema ? { content: json(schema) } : {}) });
const error = (description) => response(description, ref('Error'));
const wrapped = (schema) => ({ type: 'object', required: ['data'], properties: { data: schema } });
const id = { type: 'integer', minimum: 1, maximum: 2147483647, example: 1 };
const money = { type: 'string', pattern: '^\\d+\\.\\d{2}$', example: '1500000.00' };
const editable = {
  type: { type: 'string', enum: ['income', 'expense'], example: 'income' },
  amount: {
    description: 'Nominal positif, maksimal 13 digit integer dan 2 desimal. String dianjurkan untuk menjaga presisi.',
    oneOf: [
      { type: 'string', pattern: '^\\d{1,13}(\\.\\d{1,2})?$', example: '1500000.00' },
      { type: 'number', minimum: 0, exclusiveMinimum: true, maximum: 9999999999999.99, multipleOf: 0.01 },
    ],
  },
  description: { type: 'string', nullable: true, maxLength: 5000, example: 'Donasi bantuan bencana' },
  transaction_date: { type: 'string', format: 'date', example: '2026-11-14' },
};
const filters = [
  { name: 'type', in: 'query', schema: editable.type, description: 'Filter jenis transaksi.' },
  { name: 'date_from', in: 'query', schema: { type: 'string', format: 'date' }, description: 'Tanggal awal inklusif, tidak boleh melewati date_to.' },
  { name: 'date_to', in: 'query', schema: { type: 'string', format: 'date' }, description: 'Tanggal akhir inklusif.' },
];
const pagination = [
  { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
  { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 } },
];
const body = (name) => ({ required: true, content: json(ref(name)) });
const tag = ['Cash Transactions'];

export const openapi = {
  openapi: '3.0.3',
  info: {
    title: 'SIMPASCA API',
    version: '1.0.0',
    description: 'API seluruh tabel ERD SIMPASCA dengan autentikasi JWT Bearer. Login melalui /api/auth/login lalu gunakan Authorize. Logout mencabut token yang digunakan. Semua endpoint /api selain login memerlukan token; health dan dokumentasi publik. Belum ada otorisasi berdasarkan role. Password user di-hash dan tidak ditampilkan. Riwayat stok, laporan, dan audit bersifat append-only. Mutasi stok/audit dan snapshot laporan dibuat secara eksplisit, bukan otomatis. Nilai desimal response berupa string.',
  },
  servers: [{ url: '/', description: 'Server yang sedang digunakan' }],
  tags: [{ name: 'Health', description: 'Status aplikasi dan database' }, { name: 'Cash Transactions', description: 'Pemasukan dan pengeluaran kas' }],
  paths: {
    '/health': {
      get: {
        tags: ['Health'], operationId: 'getHealth', summary: 'Cek koneksi database',
        responses: {
          200: response('Database terhubung', ref('Health')),
          503: { description: 'Database tidak tersedia', content: { 'application/json': { schema: ref('Health'), example: { status: 'error', database: 'unavailable' } } } },
        },
      },
    },
    '/api/cash-transactions': {
      get: {
        tags: tag, operationId: 'listCashTransactions', summary: 'Daftar transaksi kas aktif',
        description: 'Diurutkan berdasarkan transaction_date DESC, id DESC. Parameter query berulang atau tidak dikenal ditolak.',
        parameters: [...pagination, ...filters],
        responses: {
          200: response('Daftar transaksi dan paginasi', ref('CashTransactionList')),
          422: error('Parameter query tidak valid'), 500: error('Kesalahan internal'),
        },
      },
      post: {
        tags: tag, operationId: 'createCashTransaction', summary: 'Buat transaksi kas',
        description: 'Gunakan request_key baru untuk setiap transaksi. Key tetap unik setelah soft delete. Retry key yang sama menghasilkan 409, bukan transaksi baru.',
        requestBody: body('CreateCashTransaction'),
        responses: {
          201: { ...response('Transaksi dibuat', wrapped(ref('CashTransaction'))), headers: { Location: { description: 'URL detail transaksi', schema: { type: 'string', example: '/api/cash-transactions/1' } } } },
          400: error('JSON tidak valid'), 409: error('request_key sudah digunakan'),
          413: error('Body melebihi 100 KB'), 422: error('Input tidak valid atau created_by tidak ditemukan'), 500: error('Kesalahan internal'),
        },
      },
    },
    '/api/cash-transactions/summary': {
      get: {
        tags: tag, operationId: 'summarizeCashTransactions', summary: 'Ringkasan kas aktif',
        description: 'Saldo = pemasukan - pengeluaran. Saldo negatif diperbolehkan. Filter type membatasi saldo ke jenis tersebut. page/limit diterima untuk kompatibilitas, tetapi tidak membatasi agregasi.',
        parameters: [...filters, ...pagination],
        responses: {
          200: response('Ringkasan transaksi sesuai filter', wrapped(ref('CashSummary'))),
          422: error('Parameter query tidak valid'), 500: error('Kesalahan internal'),
        },
      },
    },
    '/api/cash-transactions/{id}': {
      parameters: [{ name: 'id', in: 'path', required: true, schema: id }],
      get: {
        tags: tag, operationId: 'getCashTransaction', summary: 'Detail transaksi kas aktif',
        responses: {
          200: response('Detail transaksi', wrapped(ref('CashTransaction'))),
          404: error('Transaksi tidak ditemukan atau sudah dihapus'), 422: error('ID tidak valid'), 500: error('Kesalahan internal'),
        },
      },
      patch: {
        tags: tag, operationId: 'updateCashTransaction', summary: 'Ubah sebagian data transaksi',
        description: 'Minimal satu field. request_key dan created_by tidak dapat diubah.',
        requestBody: body('UpdateCashTransaction'),
        responses: {
          200: response('Transaksi diperbarui', wrapped(ref('CashTransaction'))),
          400: error('JSON tidak valid'), 404: error('Transaksi tidak ditemukan atau sudah dihapus'),
          413: error('Body melebihi 100 KB'), 422: error('ID atau input tidak valid'), 500: error('Kesalahan internal'),
        },
      },
      delete: {
        tags: tag, operationId: 'deleteCashTransaction', summary: 'Soft delete transaksi kas',
        description: 'Mengisi deleted_at, bukan menghapus baris secara permanen. Penghapusan ulang menghasilkan 404.',
        responses: {
          204: response('Transaksi dihapus; tanpa response body'),
          404: error('Transaksi tidak ditemukan atau sudah dihapus'), 422: error('ID tidak valid'), 500: error('Kesalahan internal'),
        },
      },
    },
  },
  components: {
    schemas: {
      Error: { type: 'object', required: ['message'], properties: { message: { type: 'string', example: 'Transaksi kas tidak ditemukan.' } } },
      Health: {
        type: 'object', required: ['status', 'database'],
        properties: { status: { type: 'string', enum: ['ok', 'error'] }, database: { type: 'string', enum: ['connected', 'unavailable'] } },
        example: { status: 'ok', database: 'connected' },
      },
      CreateCashTransaction: {
        type: 'object', additionalProperties: false,
        required: ['type', 'amount', 'transaction_date', 'request_key', 'created_by'],
        properties: {
          ...editable,
          request_key: { type: 'string', minLength: 1, maxLength: 100, pattern: '\\S', description: 'Key unik; spasi di awal/akhir dihapus.', example: 'donasi-20261114-001' },
          created_by: { ...id, description: 'ID user existing dari hasil seed admin.' },
        },
      },
      UpdateCashTransaction: {
        type: 'object', additionalProperties: false, minProperties: 1,
        properties: editable, example: { description: 'Donasi diperbarui', amount: '1750000.00' },
      },
      CashTransaction: {
        type: 'object',
        required: ['id', 'type', 'amount', 'description', 'transaction_date', 'request_key', 'created_by', 'created_at', 'updated_at', 'deleted_at'],
        properties: {
          ...editable, id, amount: money,
          request_key: { type: 'string', example: 'donasi-20261114-001' }, created_by: id,
          created_at: { type: 'string', format: 'date-time' }, updated_at: { type: 'string', format: 'date-time' },
          deleted_at: { type: 'string', format: 'date-time', nullable: true, example: null },
        },
      },
      CashTransactionList: {
        type: 'object', required: ['data', 'meta'],
        properties: {
          data: { type: 'array', items: ref('CashTransaction') },
          meta: {
            type: 'object', required: ['page', 'limit', 'total', 'total_pages'],
            properties: {
              page: { type: 'integer', example: 1 }, limit: { type: 'integer', example: 20 },
              total: { type: 'integer', example: 1 }, total_pages: { type: 'integer', example: 1 },
            },
          },
        },
      },
      CashSummary: {
        type: 'object', required: ['total_transactions', 'total_income', 'total_expense', 'balance'],
        properties: {
          total_transactions: { type: 'integer', example: 1 }, total_income: money,
          total_expense: { ...money, example: '0.00' }, balance: { type: 'string', pattern: '^-?\\d+\\.\\d{2}$', example: '1500000.00' },
        },
      },
    },
  },
};

addResourceDocs(openapi);
addAuthDocs(openapi);