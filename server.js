// saweria-roblox-relay
// Alur: Saweria -> POST /webhook (server ini) -> antrian di memory -> Roblox GET /poll -> habis diambil, hilang dari antrian
//
// ENV yang wajib diisi (lihat .env.example):
//   SAWERIA_STREAM_KEY = stream key akun Saweria kamu (Settings > Stream Key)
//   ROBLOX_API_KEY     = key bebas buatan sendiri, dipakai buat autentikasi request dari Roblox
//   PORT               = port server (opsional, default 8080)

const express = require("express");
const { createMiddleware } = require("saweria-webhook-express");

const STREAM_KEY = process.env.SAWERIA_STREAM_KEY;
const ROBLOX_API_KEY = process.env.ROBLOX_API_KEY;
const PORT = process.env.PORT || 8080;

if (!STREAM_KEY || !ROBLOX_API_KEY) {
  console.error("SAWERIA_STREAM_KEY dan ROBLOX_API_KEY wajib di-set di environment variables.");
  process.exit(1);
}

const app = express();

// Antrian donasi di memory. Setiap donasi diambil sekali oleh Roblox lalu dihapus dari sini.
let donationQueue = [];

// Coba tebak username Roblox dari pesan donasi.
// Konvensi yang didukung (donatur isi salah satu ini di kolom pesan Saweria):
//   "rbx: NamaUser"  |  "robux: NamaUser"  |  "user: NamaUser"  |  "ign: NamaUser"
// Kalau gak ketemu pola di atas, roblox_username akan null.
function extractRobloxUsername(message) {
  if (!message) return null;
  const match = message.match(/\b(?:rbx|robux|user|ign|username)\s*[:\-]\s*([A-Za-z0-9_]{3,20})\b/i);
  return match ? match[1] : null;
}

const verifySaweriaSignature = createMiddleware(STREAM_KEY);

app.post("/webhook", verifySaweriaSignature, express.json(), (req, res) => {
  const body = req.body || {};

  const donation = {
    id: body.id,
    donator_name: body.donator_name || "Anonim",
    amount_raw: Number(body.amount_raw) || 0,
    message: body.message || "",
    roblox_username: extractRobloxUsername(body.message),
    created_at: body.created_at || new Date().toISOString(),
  };

  donationQueue.push(donation);
  console.log("Donasi masuk:", donation);

  res.sendStatus(200);
});

// Roblox poll ke sini tiap beberapa detik. Semua item yang dikirim langsung dihapus dari antrian
// supaya server Roblox manapun yang duluan poll yang dapet (hindari donasi kekirim dobel).
app.get("/poll", (req, res) => {
  const key = req.query.key || req.headers["x-api-key"];
  if (key !== ROBLOX_API_KEY) {
    return res.sendStatus(401);
  }

  const donations = donationQueue;
  donationQueue = [];
  res.json({ donations });
});

app.get("/", (req, res) => {
  res.send("saweria-roblox-relay jalan. Antrian saat ini: " + donationQueue.length);
});

app.listen(PORT, () => {
  console.log(`Relay jalan di port ${PORT}`);
});
