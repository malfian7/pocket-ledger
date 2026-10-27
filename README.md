# Pocket Ledger

A family money tracker with four accounts: **Wife**, **Husband**, **Child** and **Super Admin**. Each account has its own password and its own entries, saved to a small database so they show up on any device.

| Account | Can use |
|---|---|
| Wife | Everything, with her own budget and entries |
| Husband | Everything, with his own budget and entries |
| Child | Dashboard, Income and Savings |
| Super Admin | Family overview of all three accounts (read only) and password resets |

- **Expenses**: item, where it was bought, the starting price and the final price after discount.
- **Daily breakdown**: totals for each day that add up to the monthly total, with a details view for every day.
- **Income**: several income entries per month (salary, side jobs, bonuses).
- **Savings**: bank deposits, gold, government bonds, money market funds and foreign currency, with an info and calculator panel for each. Stocks are information only.
- **Monthly spending limit**: a warning at 80% and an alert when you go over it.
- **Export**: an Excel workbook, a printable report (save it as PDF), CSV, and a JSON backup and restore.

On Vercel, entries are saved per account in Upstash Redis. If there's no connection, they're kept on the device and saved automatically once you're back online. When the app runs without the server (opening `index.html` directly), it switches to **demo mode**: no passwords, and entries stay in that browser.

## Project structure

```
api/                  Server functions (login, data, family overview, passwords)
index.html            Page markup
css/style.css         Styles
js/app.js             All app logic
favicon.svg           Icon
icons/                PNG icons for phones (Add to Home Screen)
manifest.webmanifest  Lets the app be installed on a phone
vercel.json           Vercel settings (clean URLs, security headers)
```

## Environment variables

| Name | What to put |
|---|---|
| `SESSION_SECRET` | Optional. If it's missing or shorter than 16 characters, the app creates its own secret and keeps it in the database. |
| `SUPERADMIN_PASSWORD` | Starting password for Super Admin |
| `WIFE_PASSWORD` | Starting password for Wife |
| `HUSBAND_PASSWORD` | Starting password for Husband |
| `CHILD_PASSWORD` | Starting password for Child |
| `KV_REST_API_URL` / `KV_REST_API_TOKEN` (or `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`) | Added for you when you connect Upstash Redis in Vercel |

Passwords are only read from these variables until someone changes them in the app. After that, a hashed copy in the database is used.

## Run locally

`vercel dev` runs both the page and the API. Opening `index.html` on its own starts demo mode.

## Updating market prices

The gold price, BI Rate, LPS rate, SBN coupons, exchange rates and IHSG are a snapshot taken on **27 October 2026**. A static site can't fetch live prices, so the numbers don't update on their own. To refresh them, edit the `MARKET` object near the top of `js/app.js`, then commit and push. Vercel redeploys automatically.

---

## Panduan deploy (Bahasa Indonesia)

### 1. Upload ke GitHub

**Cara A: lewat website GitHub (tanpa install apa pun)**

1. Masuk ke https://github.com, klik **New repository**.
2. Isi nama repo, misalnya `pocket-ledger`. **Pilih Private** (disarankan untuk aplikasi keuangan keluarga), lalu klik **Create repository**.
3. Di halaman repo yang masih kosong, klik **uploading an existing file**.
4. Seret **semua isi** folder `pocket-ledger` ke halaman itu, termasuk folder `api`. Yang diseret adalah isinya, bukan foldernya.
5. Klik **Commit changes**.

> Catatan: file `.gitignore` diawali titik, jadi kadang tersembunyi di Windows atau Mac. File ini opsional.

**Cara B: lewat Git di terminal**

```bash
cd pocket-ledger
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/USERNAME/pocket-ledger.git
git push -u origin main
```

### 2. Buat project di Vercel

1. Masuk ke https://vercel.com dengan akun GitHub Anda.
2. Klik **Add New… → Project**, pilih repo `pocket-ledger`, lalu klik **Import**.
3. Isi pengaturannya:
   - **Framework Preset**: `Other`
   - **Build Command** dan **Output Directory**: kosongkan
4. Buka bagian **Environment Variables** dan tambahkan 4 variabel ini:

   | Name (Key) | Value |
   |---|---|
   | `SUPERADMIN_PASSWORD` | Password untuk Super Admin |
   | `WIFE_PASSWORD` | Password untuk Wife |
   | `HUSBAND_PASSWORD` | Password untuk Husband |
   | `CHILD_PASSWORD` | Password untuk Child |

   Cara mengisinya:
   - Kolom **Key** diisi nama variabel persis seperti di tabel, huruf besar semua (misalnya `WIFE_PASSWORD`).
   - Kolom **Value** diisi passwordnya saja, **tanpa** tanda kutip dan tanpa `WIFE_PASSWORD=` di depannya.
   - Pastikan **Production** ikut dicentang.
   - Password membedakan huruf besar dan kecil. Pakai minimal 8 karakter, dan jangan sama dengan password email atau bank.

   `SESSION_SECRET` **tidak perlu diisi**. Aplikasi membuatnya sendiri.
5. Klik **Deploy**.

### 3. Sambungkan database (Upstash Redis)

Database ini yang membuat data bisa dibuka dari device mana pun.

1. Di Vercel, buka project `pocket-ledger`, lalu tab **Storage**.
2. Pilih **Create Database** (atau **Browse Marketplace**), lalu pilih **Upstash → Redis**. Paket gratisnya sudah cukup untuk keluarga.
3. Ikuti langkahnya sampai database **terhubung (Connect) ke project `pocket-ledger`**. Vercel otomatis menambahkan variabel `KV_REST_API_URL` dan `KV_REST_API_TOKEN`.
4. Buka tab **Deployments**, klik **⋯** pada deployment teratas, lalu pilih **Redeploy** supaya variabel barunya terbaca.

### 4. Coba masuk

Buka alamat Vercel Anda (misalnya `pocket-ledger.vercel.app`), pilih akun, lalu masukkan password yang tadi Anda isi.

- Kalau gagal masuk, klik **Having trouble signing in? Check setup** di bawah tombol Sign in. Di situ terlihat apakah database sudah tersambung dan password tiap akun sudah terbaca.
- **Setiap kali mengubah Environment Variables, lakukan Redeploy.** Tanpa Redeploy, nilai baru tidak terbaca.
- Setelah 10 kali salah password, akun itu dijeda 15 menit.
- Setelah login, password bisa diganti lewat avatar di kanan atas. Super Admin bisa mengganti password akun lain di halaman **Family**. Setelah diganti, password di Environment Variables tidak dipakai lagi untuk akun itu.

### 5. Pasang di HP (opsional)

- **iPhone (Safari)**: tombol Share → **Add to Home Screen**.
- **Android (Chrome)**: menu ⋮ → **Install app** atau **Add to Home screen**.

### Catatan data

- Setiap akun punya data sendiri. Wife dan Husband masing-masing punya budget sendiri.
- Super Admin hanya **melihat** data Wife, Husband dan Child, tidak bisa mengubahnya.
- Kalau sebelumnya sudah ada entri di browser yang sama (dari versi tanpa akun), setelah login akan muncul tombol **Move them here** untuk memindahkannya ke akun Anda.
- Backup tetap tersedia di **Reports → Download backup**.
