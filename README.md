# saweria-roblox-relay

Jembatan antara webhook Saweria dan Roblox. Roblox gak bisa terima incoming webhook,
jadi server kecil ini yang nampung donasi dari Saweria, lalu Roblox nge-poll (GET) ke sini
tiap beberapa detik buat ambil donasi baru.

## Cara pakai

1. `npm install`
2. Copy `.env.example` jadi `.env`, isi `SAWERIA_STREAM_KEY` (dari saweria.co -> Settings -> Stream Key)
   dan `ROBLOX_API_KEY` (bikin string random sendiri, minimal 20 karakter).
3. `npm start` (lokal) atau deploy ke hosting gratis/murah yang support Node.js terus-menerus
   nyala, misal Render, Railway, atau Fly.io. Jangan pakai Repl yang tidur otomatis kalau
   gak ada traffic.
4. Di saweria.co -> Integrasi -> Webhook, isi URL: `https://domain-lo.com/webhook`
5. Di Roblox, isi `POLL_URL` di `SaweriaConfig` dengan `https://domain-lo.com/poll`
   dan `API_KEY` dengan value `ROBLOX_API_KEY` yang sama persis dengan .env.

## Konvensi username Roblox di pesan donasi

Donatur nulis salah satu pola ini di kolom pesan Saweria:

```
rbx: NamaUserRoblox
robux: NamaUserRoblox
user: NamaUserRoblox
ign: NamaUserRoblox
```

Kalau gak ketemu pola itu, `roblox_username` bakal null dan notif di game cuma nampilin nama
donatur + jumlah tanpa link ke player Roblox.
