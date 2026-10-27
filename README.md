# Pocket Ledger

A monthly money tracker that runs entirely in the browser. It has no database, no account and no build step.

- **Expenses**: item, where it was bought, the starting price and the final price after discount.
- **Daily breakdown**: totals for each day that add up to the monthly total, with a details view for every day.
- **Income**: several income entries per month (salary, side jobs, bonuses).
- **Savings**: bank deposits, gold, government bonds, money market funds and foreign currency, with an info and calculator panel for each. Stocks are information only.
- **Monthly spending limit**: a warning at 80% and an alert when you go over it.
- **Export**: an Excel workbook, a printable report (save it as PDF), CSV, and a JSON backup and restore.

Your data is stored in the browser's `localStorage`. It never leaves your device. Use **Reports → Download backup** to move your data to another browser or device.

## Project structure

```
index.html            Page markup
css/style.css         Styles
js/app.js             All app logic
favicon.svg           Icon
icons/                PNG icons for phones (Add to Home Screen)
manifest.webmanifest  Lets the app be installed on a phone
vercel.json           Vercel settings (clean URLs, security headers)
```

## Run locally

Opening `index.html` directly works, but the icon paths assume a web server. For the closest match to the live site, run:

```bash
npx serve .
# or
python3 -m http.server 8000
```

Then open http://localhost:3000 (serve) or http://localhost:8000 (Python).

## Updating market prices

The gold price, BI Rate, LPS rate, SBN coupons, exchange rates and IHSG are a snapshot taken on **27 October 2026**. A static site can't fetch live prices, so the numbers don't update on their own. To refresh them, edit the `MARKET` object near the top of `js/app.js`, then commit and push. Vercel redeploys automatically.

---

## Panduan deploy (Bahasa Indonesia)

### 1. Upload ke GitHub

**Cara A: lewat website GitHub (tanpa install apa pun)**

1. Masuk ke https://github.com, klik **New repository**.
2. Isi nama repo, misalnya `pocket-ledger`, pilih **Public** atau **Private**, lalu klik **Create repository**.
3. Di halaman repo yang masih kosong, klik **uploading an existing file**.
4. Seret **semua isi** folder `pocket-ledger` ke halaman itu. Yang diseret adalah isinya (`index.html`, folder `css`, `js`, `icons`, dll.), bukan foldernya.
5. Klik **Commit changes**.

> Catatan: file `.gitignore` diawali titik, jadi kadang tersembunyi di Windows atau Mac. File ini opsional, tidak masalah kalau tidak ikut ter-upload.

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

### 2. Deploy ke Vercel

1. Masuk ke https://vercel.com dengan akun GitHub Anda.
2. Klik **Add New… → Project**, lalu pilih repo `pocket-ledger` dan klik **Import**.
3. Isi pengaturannya seperti ini:
   - **Framework Preset**: `Other`
   - **Root Directory**: `./`
   - **Build Command**: kosongkan
   - **Output Directory**: kosongkan (atau `.`)
4. Klik **Deploy**. Dalam kurang dari satu menit, situs Anda online di alamat seperti `pocket-ledger.vercel.app`.

Setiap kali Anda push perubahan ke GitHub, Vercel otomatis memperbarui situsnya.

### 3. Pasang di HP (opsional)

Buka alamat Vercel di HP, lalu:

- **iPhone (Safari)**: tombol Share → **Add to Home Screen**.
- **Android (Chrome)**: menu ⋮ → **Install app** atau **Add to Home screen**.

### Penting soal data

- Data tersimpan di browser per perangkat. Data di laptop dan di HP **tidak otomatis sinkron**.
- Untuk memindahkan data: **Reports → Download backup** di perangkat lama, lalu **Restore backup** di perangkat baru.
- Data yang Anda isi di versi preview Claude tidak ikut pindah ke situs Vercel. Pakai backup kalau ingin memindahkannya.
