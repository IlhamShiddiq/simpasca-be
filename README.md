# SIMPASCA API

API Express.js 5 + PostgreSQL untuk modul `cash_transactions`, berdasarkan ERD PNG di root proyek. Menggunakan JavaScript ES modules, Node.js 22+, dan driver `pg` dengan parameterized queries (tanpa ORM).

## Cakupan dan asumsi

- CRUD transaksi kas, paginasi, filter tanggal/jenis, ringkasan, dan soft delete.
- Kolom mengikuti ERD: `id`, `type`, `amount`, `description`, `transaction_date`, `request_key`, `created_by`, `created_at`, `updated_at`, `deleted_at`.
- `type`: `income` (pemasukan) atau `expense` (pengeluaran); nilai ini adalah asumsi karena ERD tidak mendefinisikan enum.
- `amount`: positif, PostgreSQL `NUMERIC(15,2)`. Kirim sebagai **string desimal** untuk menjaga presisi. API mengembalikan nominal sebagai string, termasuk pada daftar dan ringkasan.
- `transaction_date`: tanggal valid `YYYY-MM-DD`. Timestamp audit disimpan sebagai `TIMESTAMPTZ`.
- `request_key` unik secara global, termasuk transaksi yang sudah dihapus. Pengiriman ulang key menghasilkan **409**, bukan membuat transaksi baru. Key tidak dapat diubah.
- `created_by` wajib merujuk user yang ada dan tidak dapat diubah. Tabel `users` dan seed admin disediakan sebagai pendukung, bukan modul manajemen user.
- Belum ada autentikasi/otorisasi, audit_logs, atau modul ERD lain. Jangan expose API ke internet sebelum menambahkan autentikasi; saat ini caller dapat mengirim ID user mana pun yang valid.
- Saldo negatif diperbolehkan; ERD tidak menetapkan larangan pengeluaran melebihi pemasukan. Ringkasan menghitung transaksi aktif, bukan saldo rekening bank.

## Kredensial dan environment

File `.env` lokal sudah disediakan dan diabaikan Git. Template untuk instalasi baru: `.env.example`.

```sh
cp .env.example .env
```

**Jangan menjalankan perintah salin jika `.env` sudah berisi kredensial Anda.** Ubah `POSTGRES_PASSWORD` dan isi `SEED_ADMIN_PASSWORD` minimal 12 karakter sebelum melakukan seed. Jangan commit `.env`.

| Variable | Kegunaan |
| --- | --- |
| `PORT` | Port API lokal/port host Docker, default 3000 |
| `POSTGRES_HOST` | Host PostgreSQL untuk Node lokal, default localhost |
| `POSTGRES_PORT` | Port PostgreSQL lokal/port host Docker, default 5432 |
| `POSTGRES_DB` | Nama database |
| `POSTGRES_USER` | Username PostgreSQL |
| `POSTGRES_PASSWORD` | Password PostgreSQL |
| `DATABASE_URL` | Opsional untuk Node lokal, mengesampingkan seluruh `POSTGRES_*` |
| `SEED_ADMIN_PASSWORD` | Password yang di-hash menggunakan scrypt untuk seed admin |

Compose menggunakan `POSTGRES_*` dan mengatur host internal API menjadi `db`, port 5432. `DATABASE_URL` lokal tidak diteruskan ke container. `.env` juga tidak disalin ke image Docker.

## Jalankan dengan Docker Compose

Pastikan Docker Desktop/daemon aktif, kemudian dari root proyek:

```sh
docker compose up --build -d
docker compose logs -f api
```

Database memakai healthcheck; API menjalankan migrasi otomatis sebelum server dimulai. Setelah mengisi `SEED_ADMIN_PASSWORD` di `.env`:

```sh
docker compose run --rm api npm run db:seed
```

Seed menampilkan ID admin yang digunakan sebagai `created_by`. Jika admin sudah ada, password existing **tidak** diubah. Seed tidak dijalankan otomatis saat startup.

```sh
curl http://localhost:3000/health
docker compose ps
docker compose down
```

Data disimpan di volume `postgres_data` dan tetap ada setelah `down`. **`docker compose down -v` menghapus database permanen.** Mengubah password di `.env` tidak mengubah password database yang sudah diinisialisasi di volume; ubah melalui PostgreSQL atau buat ulang volume hanya jika datanya boleh dihapus.

Port database dan API hanya dipublikasikan ke `127.0.0.1` untuk pengembangan lokal.

## Jalankan Node.js lokal

Gunakan PostgreSQL lokal atau jalankan hanya database dengan Compose:

```sh
docker compose up -d db
npm ci
npm run db:migrate
npm run db:seed
npm run dev
```

Isi `.env` terlebih dahulu. Untuk mode tanpa watch: `npm start`. Jangan menjalankan API lokal dan API Docker pada port host yang sama secara bersamaan.

## Swagger / OpenAPI

Buka **http://localhost:3000/docs/api** setelah API berjalan. Swagger UI memuat seluruh endpoint health dan transaksi kas, skema request/response, parameter filter/paginasi, contoh payload, serta status error.

Gunakan **Try it out** untuk menjalankan request langsung ke server yang sedang dibuka. POST/PATCH/DELETE benar-benar mengubah database; gunakan data pengujian dan `created_by` dari hasil seed. Tidak ada autentikasi pada tahap ini.

Spesifikasi OpenAPI 3.0.3 tersedia di **http://localhost:3000/docs/api/openapi.json** untuk diimpor ke Postman atau tool lain. Sesuaikan port URL jika `PORT` diubah. Untuk instalasi Docker yang sudah berjalan, rebuild dengan `docker compose up --build -d`.

## Endpoint

Base URL: `http://localhost:3000`.

| Method | Path | Hasil |
| --- | --- | --- |
| GET | `/health` | Status koneksi DB (200/503) |
| GET | `/api/cash-transactions` | Daftar transaksi aktif + meta paginasi |
| GET | `/api/cash-transactions/summary` | Total pemasukan, pengeluaran, saldo |
| GET | `/api/cash-transactions/:id` | Detail transaksi aktif |
| POST | `/api/cash-transactions` | Buat transaksi (201) |
| PATCH | `/api/cash-transactions/:id` | Ubah sebagian field |
| DELETE | `/api/cash-transactions/:id` | Soft delete (204, tanpa body) |

### Buat pemasukan

Ganti `created_by` dengan ID yang ditampilkan seed. Gunakan key baru untuk transaksi baru.

```sh
curl -X POST http://localhost:3000/api/cash-transactions \
  -H 'Content-Type: application/json' \
  -d '{
    "type": "income",
    "amount": "1500000.00",
    "description": "Donasi bantuan bencana",
    "transaction_date": "2026-11-14",
    "request_key": "donasi-20261114-001",
    "created_by": 1
  }'
```

Semua field wajib kecuali `description` (string maksimal 5000 karakter atau null). `request_key` maksimal 100 karakter. Response detail/create/update berbentuk `{ "data": { ... } }`.

### Filter dan paginasi

```sh
curl 'http://localhost:3000/api/cash-transactions?page=1&limit=20&type=income&date_from=2026-11-01&date_to=2026-11-30'
curl 'http://localhost:3000/api/cash-transactions/summary?date_from=2026-11-01&date_to=2026-11-30'
```

Tanggal batas bersifat inklusif. Daftar diurutkan `transaction_date DESC, id DESC`. Default `page=1`, `limit=20`, maksimal limit 100. Meta: `page`, `limit`, `total`, `total_pages`.

Summary mendukung filter `type`, `date_from`, `date_to`; paginasi tidak membatasi perhitungan summary. Tanpa filter menghitung seluruh transaksi aktif. Dengan filter `type`, saldo hanya mencerminkan jenis yang dipilih.

```json
{
  "data": {
    "total_transactions": 1,
    "total_income": "1500000.00",
    "total_expense": "0.00",
    "balance": "1500000.00"
  }
}
```

### Ubah dan hapus

```sh
curl -X PATCH http://localhost:3000/api/cash-transactions/1 \
  -H 'Content-Type: application/json' \
  -d '{"description":"Donasi diperbarui","amount":"1750000.00"}'

curl -X DELETE http://localhost:3000/api/cash-transactions/1
```

PATCH hanya menerima `type`, `amount`, `description`, `transaction_date`. Transaksi terhapus tidak muncul pada daftar/detail/summary dan tidak dapat diubah atau dihapus ulang.

### Error

Format: `{ "message": "Penjelasan error" }`.

- 400: JSON tidak valid.
- 404: endpoint atau transaksi tidak ditemukan.
- 409: `request_key` sudah digunakan.
- 413: body melebihi batas 100 KB.
- 422: input tidak valid, field tidak dikenal, atau user tidak ditemukan.
- 500: kesalahan internal (detail tidak dikirim ke client).

## Pengujian

```sh
npm test
```

Menjalankan validasi dan smoke test HTTP tanpa database. Untuk pengujian integrasi, gunakan **database pengujian terpisah** dengan konfigurasi `.env` yang sesuai lalu:

```sh
npm run db:migrate
npm run test:integration
```

Tes integrasi menggunakan PostgreSQL nyata, transaksi dan rollback untuk membersihkan fixture. Tes mencakup CRUD, ringkasan, nominal desimal, foreign key, key duplikat, dan soft delete. Sequence PostgreSQL tetap dapat bertambah meskipun rollback. Jangan arahkan pengujian ke database produksi.

## Struktur

```text
src/
  app.js, server.js, config.js, db.js, errors.js
  cash-transactions/
    routes.js, controller.js, service.js, repository.js, validation.js
scripts/
  migrate.js, seed.js
migrations/
  001_cash_transactions.sql
test/
  validation.test.js, http.test.js
  integration/cash-transactions.test.js
```

Migrasi dicatat di `schema_migrations`, menggunakan transaction dan advisory lock agar aman dijalankan ulang. Penambahan skema berikutnya dilakukan dengan file migrasi baru, bukan mengubah migrasi yang sudah diterapkan.