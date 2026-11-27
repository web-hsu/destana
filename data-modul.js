// DESTANA — konfigurasi dan lapisan data (memuat data dari Apps Script, mengirim formulir petugas).
// Hanya dua baris di bawah ini yang perlu diisi setelah Kode.gs dideploy.
const API_BANJIR = "";          // URL Web App (…/exec)
const SPREADSHEET_URL = "";     // opsional: tautan spreadsheet laporan (tombol "Spreadsheet")

// Logo di kop halaman (opsional). Contoh: [{ src: "logo/pemkab-hsu.png", alt: "Pemkab HSU" }]
const LOGO_KIRI = [];
const LOGO_KANAN = [];

// ---------- Referensi wilayah (urutan sama dengan Kode.gs) ----------
const KEC  = ["Danau Panggang", "Babirik", "Sungai Pandan", "Amuntai Selatan", "Amuntai Tengah", "Amuntai Utara", "Banjang", "Haur Gading", "Paminggir", "Sungai Tabukan"];
const LUAS = [136.1, 82.0, 59.9, 150.0, 77.1, 37.8, 110.6, 39.0, 192.7, 22.2];   // km², dari poligon peta
const POP  = [21548, 20598, 29324, 32177, 52441, 21732, 19165, 17413, 8495, 15542];  // Dukcapil HSU, Semester I 2025
const DESA = [16, 23, 33, 30, 29, 26, 20, 18, 7, 17];                              // desa + kelurahan (BPS HSU 2025)
const LV = { Normal: 0, Waspada: 1, Siaga: 2, Awas: 3 };
const NAMA_LV = ["Normal", "Waspada", "Siaga", "Awas"];
const WARNA_LV = ["#2e9e5b", "#e5b800", "#f08a00", "#d92d27"];

// ---------- Pembantu ----------
function fmtN(n, d) { return Number(n).toLocaleString("id-ID", { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 }); }
const fx = (v, d, s) => (v == null || isNaN(v)) ? "—" : fmtN(v, d || 0) + (s || "");
const rataA = a => { const v = a.filter(x => x != null && !isNaN(x)); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null; };
const tglPendek = d => String(d).slice(8, 10) + "/" + String(d).slice(5, 7);
const tglIndo = t => new Date(t + "T00:00:00").toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
const tglWITA = off => new Date(Date.now() - (off || 0) * 864e5).toLocaleDateString("en-CA", { timeZone: "Asia/Makassar" });   // YYYY-MM-DD
const umurTeks = j => j == null ? "" : j < 1 ? "baru saja" : j < 48 ? Math.round(j) + " jam lalu" : Math.floor(j / 24) + " hari lalu";
const warnaSkor = v => v == null ? "#b8c4c9" : WARNA_LV[v >= 75 ? 3 : v >= 50 ? 2 : v >= 25 ? 1 : 0];

// ---------- Status data ----------
let SNAP = null;        // snapshot terbaru (cuaca, hujan, debit, TMA, skor, rekomendasi per kecamatan)
let REKAP = null;       // rekap harian dari sheet "Rekap Harian"
let GALAT_API = null;

async function ambilAPI(q) {
  const r = await fetch(API_BANJIR + (API_BANJIR.indexOf("?") < 0 ? "?" : "&") + q);
  if (!r.ok) throw new Error("HTTP " + r.status);
  const j = await r.json();
  if (j.error) throw new Error(j.error);
  return j;
}
async function muatSnapshot() {
  if (!API_BANJIR) { render(); return; }
  try { SNAP = await ambilAPI("d=data"); GALAT_API = null; }
  catch (e) { GALAT_API = e && e.message ? e.message : String(e); console.warn("Snapshot gagal dimuat:", e); }
  render();
}
async function muatRekap() {
  if (!API_BANJIR) return;
  try { REKAP = await ambilAPI("d=rekap&hari=14"); render(); }
  catch (e) { console.warn("Rekap gagal dimuat:", e); }
}
function iniData() {
  muatSnapshot(); muatRekap();
  setInterval(muatSnapshot, 10 * 60 * 1000);
  setInterval(muatRekap, 30 * 60 * 1000);
}

// Kirim formulir petugas (POST text/plain agar tidak memicu preflight CORS pada Apps Script)
async function kirimForm(f) {
  if (!API_BANJIR) { toast("API belum disambungkan (lihat data-modul.js)", "err"); return; }
  const btn = f.querySelector("button[type=submit]"), obj = {};
  new FormData(f).forEach((v, k) => { obj[k] = v; });
  obj.aksi = f.dataset.form;
  const lama = btn.textContent; btn.disabled = true; btn.textContent = "Menyimpan…";
  try {
    const r = await fetch(API_BANJIR, { method: "POST", body: JSON.stringify(obj) });
    const j = await r.json();
    if (j.error) throw new Error(j.error);
    if (j.snapshot) { SNAP = j.snapshot; GALAT_API = null; }
    try { sessionStorage.setItem("pinBanjir", obj.pin || ""); localStorage.setItem("petugasBanjir", obj.petugas || ""); } catch (_) {}
    toast("Tersimpan ke spreadsheet — " + obj.kec, "ok");
    tutupModal(); render(); muatRekap();
  } catch (e) {
    toast("Gagal menyimpan: " + (e && e.message ? e.message : e), "err");
  } finally { btn.disabled = false; btn.textContent = lama; }
}
