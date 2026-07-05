// saweria-roblox-relay
// Alur: Saweria -> POST /webhook (server ini) -> antrian di memory -> Roblox GET /poll -> habis diambil, hilang dari antrian
//
// ENV yang wajib diisi (lihat .env.example):
//   SAWERIA_STREAM_KEY = stream key akun Saweria kamu (Settings > Stream Key)
//   ROBLOX_API_KEY     = key bebas buatan sendiri, dipakai buat autentikasi request dari Roblox
//   PORT               = port server (opsional, default 8080)

const express = require("express");

const ROBLOX_API_KEY = process.env.ROBLOX_API_KEY;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const PORT = process.env.PORT || 8080;

if (!ROBLOX_API_KEY) {
  console.error("ROBLOX_API_KEY wajib di-set di environment variables.");
  process.exit(1);
}
if (!ADMIN_PASSWORD) {
  console.error("ADMIN_PASSWORD wajib di-set di environment variables (buat proteksi form manual).");
  process.exit(1);
}

const app = express();
app.use(express.json());

// Fitur "Webhook" Saweria yang sekarang cuma butuh URL, gak ada stream key/signature.
// Jadi URL webhook ini sendiri yang jadi "rahasia" -> jangan sampai bocor/ketebak orang lain.
// Kalau mau lebih aman, kasih path acak, misal: /webhook/x7Jk29Qz

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

app.post("/webhook", (req, res) => {
  const body = req.body || {};

  // LOG MENTAH dulu -> penting buat ngecek nama field asli yang Saweria kirim.
  // Cek log hosting (Render: tab "Logs") abis klik "Muncul Notifikasi" (tombol test) di
  // saweria.co/admin/integrations -> Webhook, terus cocokin nama field di bawah ini kalau beda.
  console.log("RAW payload dari Saweria:", JSON.stringify(body));

  // Coba beberapa kemungkinan nama field (dokumentasi resmi Saweria buat fitur Webhook ini
  // gak lengkap, jadi kita jaga-jaga beberapa variasi nama).
  const donatorName = body.donator_name || body.donator || body.name || "Anonim";
  const amountRaw = Number(body.amount_raw ?? body.amount ?? 0);
  const message = body.message || body.pesan || "";

  const donation = {
    id: body.id || Date.now().toString(),
    donator_name: donatorName,
    amount_raw: amountRaw,
    message: message,
    roblox_username: extractRobloxUsername(message),
    created_at: body.created_at || new Date().toISOString(),
  };

  donationQueue.push(donation);
  console.log("Donasi masuk (udah diparse):", donation);

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

// Halaman form manual buat masukin donasi tanpa lewat Saweria (misal transfer manual, dll)
app.get("/manual", (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<title>Manual Donation</title>
<style>
  body { font-family: sans-serif; max-width: 420px; margin: 40px auto; padding: 0 16px; }
  h1 { font-size: 20px; }
  label { display: block; margin-top: 12px; font-weight: bold; }
  input { width: 100%; padding: 8px; margin-top: 4px; box-sizing: border-box; }
  button { margin-top: 16px; width: 100%; padding: 10px; font-weight: bold; cursor: pointer; }
  #status { margin-top: 12px; }
</style>
</head>
<body>
  <h1>Manual Donation</h1>
  <form id="form">
    <label>Password</label>
    <input type="password" id="password" required>

    <label>Username Roblox</label>
    <input type="text" id="robloxUsername" required>

    <label>Pesan</label>
    <input type="text" id="message" placeholder="(opsional)">

    <label>Jumlah (Rupiah)</label>
    <input type="number" id="amount" min="1" required>

    <button type="submit">Kirim Donasi</button>
  </form>
  <div id="status"></div>

<script>
document.getElementById("form").addEventListener("submit", async function (e) {
  e.preventDefault();
  const statusEl = document.getElementById("status");
  statusEl.textContent = "Mengirim...";

  const payload = {
    password: document.getElementById("password").value,
    robloxUsername: document.getElementById("robloxUsername").value,
    message: document.getElementById("message").value,
    amount: document.getElementById("amount").value,
  };

  try {
    const res = await fetch("/manual-donate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      statusEl.textContent = "Berhasil dikirim!";
      document.getElementById("form").reset();
    } else {
      const text = await res.text();
      statusEl.textContent = "Gagal: " + text;
    }
  } catch (err) {
    statusEl.textContent = "Error: " + err.message;
  }
});
</script>
</body>
</html>`);
});

app.post("/manual-donate", (req, res) => {
  const body = req.body || {};

  if (body.password !== ADMIN_PASSWORD) {
    return res.status(401).send("Password salah");
  }

  const robloxUsername = (body.robloxUsername || "").trim();
  const amountRaw = Number(body.amount);

  if (!robloxUsername) {
    return res.status(400).send("Username Roblox wajib diisi");
  }
  if (!amountRaw || amountRaw <= 0) {
    return res.status(400).send("Jumlah harus angka lebih dari 0");
  }

  const donation = {
    id: "manual-" + Date.now(),
    donator_name: robloxUsername,
    amount_raw: amountRaw,
    message: body.message || "",
    roblox_username: robloxUsername,
    created_at: new Date().toISOString(),
  };

  donationQueue.push(donation);
  console.log("Donasi manual masuk:", donation);

  res.sendStatus(200);
});

app.listen(PORT, () => {
  console.log(`Relay jalan di port ${PORT}`);
});
