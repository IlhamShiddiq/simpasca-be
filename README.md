# SIMPASCA API

API Express.js 5 + PostgreSQL dengan skema database dan endpoint untuk seluruh tabel berdasarkan ERD PNG di root proyek. Menggunakan JavaScript ES modules, Node.js 22+, dan driver `pg` dengan parameterized queries (tanpa ORM).

## Cakupan dan asumsi

- CRUD transaksi kas, paginasi, filter tanggal/jenis, ringkasan, dan soft delete.
- Kolom mengikuti ERD: `id`, `type`, `amount`, `description`, `transaction_date`, `request_key`, `created_by`, `created_at`, `updated_at`, `deleted_at`.
- `type`: `income` (pemasukan) atau `expense` (pengeluaran); nilai ini adalah asumsi karena ERD tidak mendefinisikan enum.
- `amount`: positif, PostgreSQL `NUMERIC(15,2)`. Kirim sebagai **string desimal** untuk menjaga presisi. API mengembalikan nominal sebagai string, termasuk pada daftar dan ringkasan.
- `transaction_date`: tanggal valid `YYYY-MM-DD`. Timestamp audit disimpan sebagai `TIMESTAMPTZ`.
- `request_key` unik secara global, termasuk transaksi yang sudah dihapus. Pengiriman ulang key menghasilkan **409**, bukan membuat transaksi baru. Key tidak dapat diubah.
- `created_by` wajib merujuk user yang ada dan tidak dapat diubah. API user dan seed admin tersedia; password di-hash dengan scrypt dan hash tidak pernah ditampilkan oleh API user.
- Semua endpoint `/api` selain login memerlukan **JWT Bearer token**. **Belum ada otorisasi berdasarkan role**: setiap user yang login dapat mengakses seluruh modul, termasuk mengubah user/role dan mengirim ID petugas yang valid. Batasi ke lingkungan tepercaya sampai kontrol akses dan audit server-side ditambahkan. Gunakan HTTPS untuk deployment.
- Saldo negatif diperbolehkan; ERD tidak menetapkan larangan pengeluaran melebihi pemasukan. Ringkasan menghitung transaksi aktif, bukan saldo rekening bank.

## Skema database sesuai ERD

Migration `002_complete_erd.sql` menambahkan delapan tabel tanpa mengubah migration awal maupun menghapus data existing. Jalankan `npm run db:migrate` (atau `docker compose run --rm api npm run db:migrate` setelah rebuild image) untuk menerapkannya. Database baru akan menjalankan kedua migration secara berurutan; database lama hanya menjalankan migration yang belum tercatat.

| Tabel | Relasi utama |
| --- | --- |
| `users` | Akun petugas; username unik |
| `disasters` | `created_by` → users |
| `inventory_items` | `created_by` → users |
| `shipments` | `disaster_id` → disasters; `created_by` → users |
| `shipment_items` | `shipment_id` → shipments; `item_id` → inventory_items; pasangan keduanya unik |
| `stock_receipts` | `item_id` → inventory_items; `created_by` → users |
| `stock_movements` | `item_id` → inventory_items; `disaster_id` → disasters; `receipt_id` → stock_receipts; `shipment_item_id` → shipment_items; `created_by` → users |
| `generated_reports` | `disaster_id` → disasters; `generated_by` → users |
| `cash_transactions` | `created_by` → users |
| `audit_logs` | `user_id` → users; `entity_type` + `entity_id` adalah referensi polimorfik, bukan foreign key |

Asumsi implementasi untuk detail yang tidak ditentukan ERD:

- ID menggunakan `SERIAL`/`INTEGER`, waktu menggunakan `TIMESTAMPTZ`, dan kolom tanggal menggunakan `DATE`. `timestamps` pada ERD berarti `created_at` dan `updated_at`; pembaruan `updated_at` menjadi tanggung jawab query aplikasi, bukan trigger.
- Jumlah stok menggunakan `NUMERIC(15,3)` untuk mendukung satuan pecahan; `need_ratio` menggunakan `NUMERIC(15,6)` dan wajib positif jika diisi. Stok awal dan jumlah terdampak tidak boleh negatif; jumlah penerimaan/pengiriman wajib positif.
- `latitude`/`longitude` opsional dengan rentang -90…90 / -180…180. Catatan, detail lokasi, tanggal kedaluwarsa, konfigurasi kebutuhan, dan waktu pengiriman/penerimaan boleh kosong. Status, kategori, role, skala penanganan, dan jenis pergerakan tidak dibatasi enum karena pilihan nilainya tidak dijelaskan ERD.
- `stock_movements.disaster_id`, `receipt_id`, dan `shipment_item_id` opsional agar dapat merepresentasikan stok awal/penyesuaian maupun penerimaan/pengiriman. Satu baris wajib memiliki tepat satu arah jumlah positif (masuk atau keluar), dan tidak boleh merujuk penerimaan sekaligus detail pengiriman. Kesesuaian item/bencana dengan dokumen sumber dan perhitungan saldo tetap menjadi tanggung jawab aplikasi.
- Semua foreign key memakai `ON DELETE RESTRICT` untuk menjaga histori. Soft delete hanya ditambahkan pada tabel yang mencantumkan `deleted_at` di ERD. Unique key tetap berlaku setelah soft delete, termasuk pasangan `(shipment_id, item_id)`.
- `report_snapshot`, `before_data`, dan `after_data` menggunakan `JSONB`. Snapshot laporan dan nama pembuat wajib disediakan; data sebelum/sesudah audit boleh kosong. Tidak ada trigger otomatis untuk audit, pembuatan laporan, atau mutasi stok.
- Kolom relasi diberi indeks; daftar transaksi aktif menggunakan partial index. Tidak ditambahkan kolom audit waktu/soft delete pada tabel yang tidak mencantumkannya di ERD.

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
| `JWT_SECRET` | Wajib, secret acak minimal 32 byte untuk menandatangani JWT HS256 |
| `JWT_EXPIRES_IN_SECONDS` | Masa berlaku token dalam detik, default 3600, rentang 60–86400 |

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

## CORS

Atur origin yang boleh mengakses API melalui browser di `.env`:

```env
# Izinkan semua origin
CORS_ORIGINS=*
```

Atau gunakan allowlist (cocok untuk production):

```env
CORS_ORIGINS=https://simpasca.com,https://admin.simpasca.com,http://localhost:5173
```

Origin harus mencakup protokol dan port jika ada, tanpa path atau trailing slash. Jangan gabungkan `*` dengan daftar origin. Nilai tidak valid membuat startup gagal agar salah konfigurasi terlihat. Jika variabel kosong/tidak diisi, akses cross-origin browser tidak diizinkan; akses same-origin tetap berjalan.

Middleware menangani preflight `OPTIONS` otomatis dan mengizinkan header request yang diminta browser, termasuk `Content-Type` dan `Authorization`. Header response `Location` diekspos ke frontend. Cookie cross-origin (`credentials: 'include'`) tidak didukung konfigurasi ini; `credentials` tidak diaktifkan, termasuk pada mode wildcard.

Origin yang tidak ada di allowlist tidak mendapat header izin CORS; ini bukan blokir request di server. CORS hanya diterapkan browser dan bukan pengganti autentikasi/otorisasi.

Restart server setelah mengubah `.env`. Untuk Docker, jalankan `docker compose up --build -d api` agar konfigurasi environment diterapkan ulang. `.env` lokal disetel `CORS_ORIGINS=*` untuk pengembangan.

## Swagger / OpenAPI

Buka **http://localhost:3000/docs/api** setelah API berjalan. Swagger UI memuat seluruh endpoint health dan 10 modul ERD, skema request/response, parameter filter/paginasi, serta status error.

Gunakan **Try it out** untuk menjalankan request langsung ke server yang sedang dibuka. Login melalui `/api/auth/login`, salin `data.access_token`, lalu klik **Authorize** dan tempel token (tanpa prefix `Bearer`). Swagger akan mengirim header Authorization. POST/PATCH/DELETE benar-benar mengubah database; gunakan data pengujian dan `created_by` dari hasil seed.

Spesifikasi OpenAPI 3.0.3 tersedia di **http://localhost:3000/docs/api/openapi.json** untuk diimpor ke Postman atau tool lain. Sesuaikan port URL jika `PORT` diubah. Untuk instalasi Docker yang sudah berjalan, rebuild dengan `docker compose up --build -d`.

## Autentikasi JWT

Set `JWT_SECRET` pada `.env` sebelum menjalankan server. Buat secret acak dengan:

```sh
node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))"
```

Salin hasilnya ke `JWT_SECRET`; jangan commit atau bagikan nilainya. `.env` lokal telah ditambahkan secret acak saat implementasi jika sebelumnya belum tersedia. Server gagal startup jika secret kosong/kurang dari 32 byte atau durasi token tidak valid. Semua instance API harus memakai secret yang sama. Mengganti secret membatalkan seluruh token lama.

Jalankan migration dan seed untuk menyediakan akun pertama (tidak ada registrasi publik):

```sh
npm run db:migrate
npm run db:seed
```

Migration `003_auth_revoked_tokens.sql` menambahkan penyimpanan pencabutan JWT yang persisten. Password login admin adalah password seed awal; menjalankan seed lagi tidak mengganti password existing.

| Method | Path | Akses |
| --- | --- | --- |
| POST | `/api/auth/login` | Publik; body `username` dan `password` |
| POST | `/api/auth/logout` | Bearer token; mencabut token saat ini; response 204 |
| GET | `/api/auth/me` | Bearer token; profil user terbaru tanpa password/hash |

### Login

```sh
curl -X POST http://localhost:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"password-admin-anda"}'
```

Response berbentuk `{ "data": { "access_token": "...", "token_type": "Bearer", "expires_in": 3600, "user": { "id": 1, "name": "Administrator", "username": "admin", "role": "admin" } } }`.

Kredensial salah menghasilkan 401 dengan pesan yang sama untuk username tidak ditemukan maupun password salah. Input tidak valid menghasilkan 422. Token memiliki `sub`, `jti`, `iat`, `exp`, issuer dan audience; hanya algoritma HS256 yang diterima.

### Gunakan token

Simpan nilai `data.access_token` sebagai variabel shell `TOKEN`, lalu sertakan header pada **semua** request endpoint data:

```sh
curl http://localhost:3000/api/auth/me -H "Authorization: Bearer $TOKEN"
curl http://localhost:3000/api/disasters -H "Authorization: Bearer $TOKEN"
curl http://localhost:3000/api/cash-transactions -H "Authorization: Bearer $TOKEN"
curl -X POST http://localhost:3000/api/auth/logout -H "Authorization: Bearer $TOKEN"
```

Contoh curl modul lain di README juga memerlukan `-H "Authorization: Bearer $TOKEN"`. Token tidak diterima lewat query string/cookie. Tanpa token, token tidak valid/kedaluwarsa/dicabut, atau user telah dihapus menghasilkan **401** dan header `WWW-Authenticate: Bearer`. `/health`, `/docs/api`, dan spesifikasi OpenAPI tetap publik; preflight CORS tidak memerlukan token.

Logout mencabut **token yang sedang digunakan**, bukan seluruh sesi user. Pencabutan tersimpan di PostgreSQL sehingga tetap berlaku setelah restart API. Token dari login lain tetap berlaku. Client harus menghapus token lokal setelah logout. Tidak ada refresh token; login ulang setelah kedaluwarsa. Perubahan password belum membatalkan token lain otomatis. Baris pencabutan kedaluwarsa dapat dibersihkan berkala melalui `DELETE FROM auth_revoked_tokens WHERE expires_at <= NOW()`.

Belum tersedia rate limiting/lockout login maupun pembatasan berdasarkan role; gunakan pembatasan request di reverse proxy dan kontrol akses sebelum deployment publik. Field `created_by` dan nama snapshot masih input caller, bukan otomatis dari token.

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

## API modul ERD lainnya

Seluruh path berikut diawali `/api`. Semua modul mendukung:

- `GET /<modul>`: daftar dengan `{ data: [...], meta: { page, limit, total, total_pages } }`.
- `GET /<modul>/:id`: detail dengan `{ data: {...} }`.
- `POST /<modul>`: buat data, response **201** dan header `Location`.
- Modul CRUD juga mendukung `PATCH /<modul>/:id` untuk pembaruan parsial dan `DELETE /<modul>/:id` dengan response **204** tanpa body.
- Modul append-only **tidak menyediakan PATCH/DELETE** (404).

| Modul | Operasi | Filter daftar selain `page`, `limit` |
| --- | --- | --- |
| `users` | CRUD; hard delete | `username`, `role` |
| `disasters` | CRUD; hard delete | `status`, `disaster_type`, `province`, `regency_city`, `created_by` |
| `inventory-items` | CRUD; hard delete | `category`, `stock_unit`, `need_type`, `created_by` |
| `shipments` | CRUD; soft delete | `disaster_id`, `status`, `created_by` |
| `shipment-items` | CRUD; soft delete | `shipment_id`, `item_id` |
| `stock-receipts` | CRUD; soft delete | `item_id`, `item_condition`, `created_by` |
| `stock-movements` | Daftar, detail, buat (append-only) | `item_id`, `disaster_id`, `receipt_id`, `shipment_item_id`, `movement_type`, `created_by` |
| `generated-reports` | Daftar, detail, buat (append-only) | `disaster_id`, `generated_by` |
| `audit-logs` | Daftar, detail, buat (append-only) | `user_id`, `action`, `entity_type`, `entity_id` |

Filter menggunakan exact-match dan dapat digabungkan. Daftar modul baru diurutkan `id DESC`; default `page=1`, `limit=20`, maksimal 100. ID wajib integer positif maksimal 2147483647. Parameter berulang, parameter tidak dikenal, field tidak dikenal, dan PATCH kosong menghasilkan **422**. Data soft-deleted tidak muncul dalam daftar/detail dan tidak dapat diubah lagi. Hard delete data yang masih direferensikan menghasilkan **409**.

### Contoh payload POST

Sesuaikan ID dengan response data yang dibuat sebelumnya. Nilai enum seperti `active`, `draft`, dan `receipt` di bawah hanya contoh, bukan daftar enum yang dibatasi server.

**`/api/users`** — password wajib 12–256 karakter; hanya field `password` yang diterima, bukan `password_hash`. PATCH password akan membuat hash baru.

```json
{"name":"Petugas","username":"petugas1","password":"Ganti-password-aman-123","role":"operator"}
```

**`/api/disasters`**

```json
{"disaster_type":"banjir","province":"Jawa Barat","regency_city":"Bandung","latitude":"-6.9175000","longitude":"107.6191000","status":"active","handling_scale":"city","occurred_at":"2026-11-21T08:00:00+07:00","affected_people":100,"affected_households":25,"created_by":1}
```

Opsional: `latitude`, `longitude`, `location_details`, `impact_notes` (boleh null). `affected_people` dan `affected_households` default 0.

**`/api/inventory-items`**

```json
{"name":"Beras","category":"pangan","stock_unit":"kg","initial_stock":"100.000","need_ratio":"0.500000","need_type":"daily","ratio_basis":"person","expiration_date":"2027-11-21","created_by":1}
```

`initial_stock` opsional, default 0; `need_ratio`, `need_type`, `ratio_basis`, dan `expiration_date` opsional/boleh null. Jumlah stok menggunakan string desimal maksimal 3 angka di belakang koma; rasio maksimal 6 angka.

**`/api/shipments`**

```json
{"disaster_id":1,"status":"draft","destination":"Posko Bandung","person_in_charge":"Petugas","request_key":"shipment-001","created_by":1}
```

`shipped_at` dan `received_at` opsional/boleh null. Timestamp wajib ISO 8601 dengan zona waktu. `received_at` memerlukan `shipped_at` dan tidak boleh mendahuluinya. `request_key` dan `created_by` tidak dapat diubah.

**`/api/shipment-items`**

```json
{"shipment_id":1,"item_id":1,"quantity":"10.125"}
```

Pasangan pengiriman/barang unik termasuk setelah soft delete. `shipment_id` dan `item_id` tidak dapat diubah melalui PATCH; hanya `quantity` yang dapat diperbarui.

**`/api/stock-receipts`**

```json
{"item_id":1,"quantity":"50.000","receipt_date":"2026-11-21","source_giver":"Donatur","item_condition":"good","notes":"Donasi pangan","request_key":"receipt-001","created_by":1}
```

`notes` opsional/boleh null. `item_id`, `request_key`, dan `created_by` tidak dapat diubah.

**`/api/stock-movements`**

```json
{"item_id":1,"receipt_id":1,"movement_type":"receipt","quantity_in":"50.000","movement_date":"2026-11-21","created_by":1}
```

Mutasi keluar menggunakan `quantity_out` dan dapat merujuk `shipment_item_id` serta `disaster_id`. Wajib tepat satu arah positif; arah lainnya default 0. Referensi penerimaan dan detail pengiriman tidak boleh diisi bersamaan. `notes` opsional/boleh null.

**`/api/generated-reports`**

```json
{"disaster_id":1,"report_snapshot":{"title":"Laporan Banjir","items":[{"item_id":1,"quantity":"10.125"}]},"generated_by":1,"generated_by_name":"Petugas"}
```

API menyimpan snapshot object JSON yang dikirim caller; tidak menghitung/menghasilkan isi laporan otomatis. `generated_at` diisi database dan tidak diterima dari caller.

**`/api/audit-logs`**

```json
{"user_id":1,"action":"update","entity_type":"shipments","entity_id":1,"before_data":{"status":"draft"},"after_data":{"status":"shipped"}}
```

`before_data`/`after_data` opsional, berupa object JSON atau null. `occurred_at` diisi database. Referensi entity bersifat polimorfik dan tidak diperiksa sebagai foreign key.

### Batasan alur operasional

- Endpoint penerimaan/pengiriman **tidak otomatis membuat mutasi stok**, dan perubahan/soft delete dokumen tidak otomatis membalik mutasi. Pencatatan mutasi adalah operasi eksplisit melalui endpoint append-only; saldo stok dan larangan saldo negatif belum diimplementasikan.
- Foreign key memastikan referensi ada, tetapi belum memvalidasi kesesuaian `item_id`/`disaster_id` mutasi terhadap dokumen sumber atau menolak referensi ke dokumen soft-deleted. Konsistensi lintas dokumen tersebut belum merupakan workflow otomatis.
- API tidak otomatis membuat audit pada setiap perubahan dan tidak mengambil nama petugas/snapshot dari token. Jangan perlakukan audit/snapshot kiriman caller sebagai bukti tepercaya sebelum pencatatan server-side dan kontrol akses ditambahkan.
- `created_by`, `request_key`, dan field relasi yang ditandai immutable di Swagger tidak dapat diubah. Field waktu otomatis tidak diterima pada request; exception adalah waktu kejadian bencana dan waktu pengiriman/penerimaan.
- Error: **400** JSON tidak valid, **404** tidak ditemukan/operasi tidak tersedia, **409** konflik unique key atau hard delete yang masih direferensikan, **413** body melebihi 100 KB, **422** validasi/foreign key/constraint, **500** kesalahan internal.

## Pengujian

```sh
npm test
```

Menjalankan validasi dan smoke test HTTP tanpa database. Untuk pengujian integrasi, gunakan **database pengujian terpisah** dengan konfigurasi `.env` yang sesuai lalu:

```sh
npm run db:migrate
npm run test:integration
```

Tes integrasi menggunakan PostgreSQL nyata, transaksi dan rollback untuk membersihkan fixture. Tes mencakup CRUD, ringkasan, nominal desimal, foreign key, key duplikat, dan soft delete. `schema.test.js` juga menjalankan seluruh migration dalam schema sementara yang di-rollback, memeriksa 10 tabel ERD, relasi, JSONB, presisi stok, dan constraint. `modules.test.js` menguji HTTP untuk seluruh modul tambahan, filter/paginasi, hashing password, konflik referensi, PATCH, hard/soft delete, serta proteksi riwayat append-only. Sequence PostgreSQL tetap dapat bertambah meskipun rollback. Jangan arahkan pengujian ke database produksi.

## Struktur

```text
src/
  app.js, server.js, config.js, db.js, errors.js
  cash-transactions/
    routes.js, controller.js, service.js, repository.js, validation.js
  users/
    routes.js, controller.js, service.js, repository.js, validation.js
  disasters/
    routes.js, controller.js, service.js, repository.js, validation.js
  inventory-items/
    routes.js, controller.js, service.js, repository.js, validation.js
  shipments/
    routes.js, controller.js, service.js, repository.js, validation.js
  shipment-items/
    routes.js, controller.js, service.js, repository.js, validation.js
  stock-receipts/
    routes.js, controller.js, service.js, repository.js, validation.js
  stock-movements/
    routes.js, controller.js, service.js, repository.js, validation.js
  generated-reports/
    routes.js, controller.js, service.js, repository.js, validation.js
  audit-logs/
    routes.js, controller.js, service.js, repository.js, validation.js
  shared/validation.js
  docs/openapi.js, resource-openapi.js, resource-definitions.js
scripts/
  migrate.js, seed.js
migrations/
  001_cash_transactions.sql
  002_complete_erd.sql
test/
  validation.test.js, http.test.js
  integration/cash-transactions.test.js
  integration/schema.test.js
  modules.test.js
  integration/modules.test.js
```

Migrasi dicatat di `schema_migrations`, menggunakan transaction dan advisory lock agar aman dijalankan ulang. Penambahan skema berikutnya dilakukan dengan file migrasi baru, bukan mengubah migrasi yang sudah diterapkan.
Setiap modul menggunakan alur `routes → controller → service → repository`, dengan `validation.js` sendiri, mengikuti pola `cash-transactions`. Query SQL dan aturan request ditulis per modul; `shared/validation.js` hanya menyediakan validasi nilai dasar. Metadata pada `docs/resource-definitions.js` hanya digunakan Swagger, bukan untuk menjalankan API.
