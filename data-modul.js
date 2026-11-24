// Menu, modul, dan penyusun data Aplikasi DESTANA HSU.
// Data dinamis (cuaca, hujan, debit, TMA, kesiapan, rekap) dibaca dari Apps Script (Kode.gs) yang merekam ke Spreadsheet.

// ====== PENGATURAN — isi setelah Kode.gs dideploy sebagai Web App ======
const API_BANJIR = "https://script.google.com/macros/s/AKfycbwundjXJBo5urMq_jxkmJrWdmt638EQvuLK5BRO-Fz3EeCE-UL4lPjC8wcpa0fz9vyg/exec";          // URL Web App (…/exec)
const SPREADSHEET_URL = "";     // opsional: tautan spreadsheet laporan (tombol "Buka spreadsheet" di modul Laporan)

// Format angka gaya Indonesia (titik ribuan, koma desimal)
function fmtN(n, d) { return Number(n).toLocaleString("id-ID", { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 }); }

// ---------- Definisi menu ----------
const BIDANG = [
  { id: "kesiapan", nama: "Kesiapan", ikon: "i-alert", sisi: "kiri", modul: [
      ["Status Siaga Banjir", "Skor risiko per kecamatan"], ["Rekomendasi Tindakan", "Langkah sesuai tingkat siaga"],
      ["Sumber Daya Siaga", "Perahu, posko, relawan, logistik"] ] },
  { id: "cuaca", nama: "Cuaca", ikon: "i-cloud", sisi: "kiri", modul: [
      ["Prakiraan Cuaca", "BMKG per kecamatan"], ["Curah Hujan", "3 hari lalu s.d. 7 hari ke depan"] ] },
  { id: "tma", nama: "Tinggi Air", ikon: "i-wave", sisi: "kanan", modul: [
      ["Tinggi Muka Air", "Pembacaan pos duga terakhir"], ["Input Pembacaan", "Untuk petugas pos duga"] ] },
  { id: "debit", nama: "Debit Air", ikon: "i-drop", sisi: "kanan", modul: [
      ["Debit Sungai", "Debit sekarang dan puncak 7 hari"], ["Tren Debit", "7 hari lalu s.d. 7 hari ke depan"] ] },
  { id: "laporan", nama: "Laporan", ikon: "i-doc", sisi: "kanan", modul: [
      ["Rekap Kecamatan", "Kondisi harian dari spreadsheet"], ["Riwayat Kecamatan", "Tren 14 hari"] ] }
];

// ---------- Data referensi wilayah ----------
const KEC  = ["Danau Panggang","Babirik","Sungai Pandan","Amuntai Selatan","Amuntai Tengah","Amuntai Utara","Banjang","Haur Gading","Paminggir","Sungai Tabukan"];
const LUAS = [136.1, 82.0, 59.9, 150.0, 77.1, 37.8, 110.6, 39.0, 192.7, 22.2];   // km², dihitung dari poligon batas pada peta
const POP  = [21548,20598,29324,32177,52441,21732,19165,17413,8495,15542];       // Dukcapil HSU, Semester I 2025
const DESA = [16,23,33,30,29,26,20,18,7,17];                                     // desa+kelurahan per kecamatan, 2025 (BPS HSU)
const KPD  = POP.map((p, i) => Math.round(p / LUAS[i]));

// ---------- Status data ----------
let SNAP = null;          // snapshot terbaru dari Apps Script
let REKAP = null;         // rekap harian dari sheet "Rekap Harian"
let GALAT_API = null;
const LV = { Normal: 0, Waspada: 1, Siaga: 2, Awas: 3 };

function pesanData() {
  if (!API_BANJIR) return "API belum disambungkan. Isi API_BANJIR di data-modul.js setelah Kode.gs dideploy sebagai Web App.";
  if (GALAT_API) return "Data belum dapat dimuat: " + GALAT_API;
  return "Memuat data…";
}

const SUMBER_ANALISIS = "Analisis HSU — skor 0–100 dari curah hujan (30%), tinggi muka air (35%) dan debit sungai (25%), dinormalkan bila ada faktor yang datanya kosong, lalu diperbesar hingga +25% oleh keterpaparan penduduk (kepadatan). Ambang siaga dan target kesiapan memakai sheet \"Ambang & Target\".";
const SUMBER_BMKG = "BMKG — Prakiraan Cuaca Terbuka (data.bmkg.go.id), desa/kelurahan wakil tiap kecamatan";
const SUMBER_HUJAN = "Open-Meteo (model cuaca global) di titik tengah tiap kecamatan";
const SUMBER_DEBIT = "GloFAS via Open-Meteo Flood API — debit simulasi pada sel ±5 km, sungai terbesar terdekat; bukan alat ukur lapangan";
const SUMBER_TMA = "Pembacaan petugas pos duga (diinput lewat aplikasi ini), tersimpan di sheet \"TMA\"";
const SUMBER_SS = "Spreadsheet DESTANA HSU — sheet \"Pemantauan\" (tiap 3 jam) dan \"Rekap Harian\"";

// ---------- Pembantu ----------
const pilih = () => (typeof kecAktif !== "undefined" && kecAktif && SNAP && SNAP.kec[kecAktif]) ? SNAP.kec[kecAktif] : null;
const rataA = a => { const v = a.filter(x => x != null && !isNaN(x)); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null; };
const fx = (v, d, s) => (v == null || isNaN(v)) ? "—" : fmtN(v, d || 0) + (s || "");
const tglPendek = d => String(d).slice(8, 10) + "/" + String(d).slice(5, 7);
const umurTeks = j => j == null ? "" : j < 1 ? "baru saja" : j < 48 ? Math.round(j) + " jam lalu" : Math.floor(j / 24) + " hari lalu";
const tglIndo = t => new Date(t + "T00:00:00").toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });

function kosongData(sumber, labels, extra) {
  return Object.assign({ s: "tunggu", ind: labels.map(l => [l, "—"]), sumber: sumber, pesan: pesanData() }, extra || {});
}
// satu grafik batang per kecamatan dari fungsi nilai; null bila tak ada satu pun nilai
function grafikKec(judul, f, dec, extra) {
  const labels = [], values = [];
  KEC.forEach(k => { const c = SNAP.kec[k]; if (!c) return; const v = f(c); if (v != null && !isNaN(v)) { labels.push(k); values.push(v); } });
  return labels.length ? Object.assign({ judul: judul, labels: labels, values: values, dec: dec || 0 }, extra || {}) : null;
}
function grafikSeri(judul, items, dec) {          // items: [{d, v}] berurutan waktu
  return items.length ? { judul: judul, labels: items.map(i => tglPendek(i.d)), values: items.map(i => i.v), dec: dec || 0, urut: false } : null;
}
function rapikan(d, grafikList, adaPeta) {
  const g = grafikList.filter(Boolean);
  if (g.length) { d.grafik = g; if (adaPeta && grafikList[0]) d.peta = 0; }
  return d;
}
function catatGalat(info) { return SNAP && SNAP.galat && SNAP.galat.length ? info + " Sumber bermasalah: " + SNAP.galat.join("; ") + "." : info; }

// seri harian rata-rata kabupaten dari fungsi f(kecamatan) -> [{d, v}]
function seriKab(f, agregat) {
  const per = {};
  KEC.forEach(k => { const c = SNAP.kec[k]; if (!c) return; (f(c) || []).forEach(p => { (per[p.d] = per[p.d] || []).push(p.v); }); });
  return Object.keys(per).sort().map(d => ({ d: d, v: agregat === "maks" ? Math.max.apply(null, per[d]) : rataA(per[d]) }));
}

// ---------- Penyusun modul ----------
function mStatus() {
  if (!SNAP) return kosongData(SUMBER_ANALISIS, ["Tingkat siaga tertinggi", "Kecamatan Siaga / Awas", "Rata-rata skor risiko", "Kesiapan sumber daya"]);
  const r = SNAP.ringkas, c = pilih();
  let ind;
  if (c) {
    ind = [["Tingkat siaga · " + kecAktif, c.skor.status, "skor risiko " + c.skor.risiko + " dari 100" + (c.skor.lengkap < 3 ? " · hanya " + c.skor.lengkap + " dari 3 faktor ada datanya" : "")],
           ["Tinggi muka air", c.tma ? fmtN(c.tma.cm) + " cm" : "—", c.tma ? c.tma.status + " · " + umurTeks(c.tma.umurJam) + (c.tma.valid ? "" : " (kedaluwarsa, tidak dihitung)") : "belum ada pembacaan"],
           ["Hujan 3 hari ke depan", c.hujan ? fmtN(c.hujan.h3, 1) + " mm" : "—", c.hujan ? "tertinggi " + fmtN(c.hujan.m1, 1) + " mm/hari" : ""],
           ["Debit sungai", c.debit ? fmtN(c.debit.now, 1) + " m³/s" : "—", c.debit && c.debit.rasio != null ? "puncak 7 hari " + fmtN(c.debit.rasio, 2) + "× rata-rata" : ""]];
  } else {
    const t = r.teratas[0];
    ind = [["Tingkat siaga tertinggi", r.tertinggi, t ? t.n + " · skor " + t.skor : ""],
           ["Kecamatan Siaga / Awas", fmtN(r.hitung.Siaga + r.hitung.Awas), "dari " + KEC.length + " kecamatan"],
           ["Rata-rata skor risiko", fmtN(r.rataSkor), "skala 0–100"],
           ["Kesiapan sumber daya", r.rataKesiapan != null ? r.rataKesiapan + "%" : "—", r.kesiapanTerisi + " dari " + KEC.length + " kecamatan sudah input"]];
  }
  const g0 = grafikKec("Skor risiko banjir per kecamatan (0–100)", x => x.skor.risiko, 0, { skala: "risiko" });
  const g1 = c ? { judul: "Skor faktor risiko — " + kecAktif + " (0–100)", urut: false, dec: 0,
    labels: ["Tinggi muka air" + (c.skor.tma == null ? " (tanpa data)" : ""), "Curah hujan" + (c.skor.hujan == null ? " (tanpa data)" : ""),
             "Debit sungai" + (c.skor.debit == null ? " (tanpa data)" : ""), "Keterpaparan penduduk"],
    values: [c.skor.tma || 0, c.skor.hujan || 0, c.skor.debit || 0, c.skor.paparan] } : null;
  return rapikan({ s: "ada", sumber: SUMBER_ANALISIS, ind: ind,
    info: catatGalat("Tingkat: Normal < 25, Waspada 25–49, Siaga 50–74, Awas ≥ 75. TMA di atas ambang Siaga/Awas otomatis menaikkan tingkat minimal ke Siaga/Awas. Klik kecamatan pada peta atau grafik untuk melihat faktor penyebabnya.") }, [g0, g1], true);
}

function mRekomendasi() {
  if (!SNAP) return kosongData(SUMBER_ANALISIS, ["Tingkat siaga", "Skor risiko"]);
  const c = pilih(), r = SNAP.ringkas;
  const urut = KEC.filter(k => SNAP.kec[k]).sort((a, b) => SNAP.kec[b].skor.risiko - SNAP.kec[a].skor.risiko);
  let profil, ind;
  if (c) {
    ind = [["Tingkat siaga · " + kecAktif, c.skor.status, "skor " + c.skor.risiko + " dari 100"],
           ["Kesiapan sumber daya", c.kes ? c.kes.pct + "%" : "—", c.kes ? "pembaruan " + c.kes.waktu : "belum diinput"]];
    profil = c.rekom;
  } else {
    ind = [["Tingkat siaga tertinggi", r.tertinggi, r.teratas[0] ? r.teratas[0].n : ""], ["Kecamatan di atas Normal", fmtN(KEC.length - r.hitung.Normal), "dari " + KEC.length + " kecamatan"]];
    profil = urut.filter(k => SNAP.kec[k].skor.status !== "Normal").map(k => k + " (" + SNAP.kec[k].skor.status + ", " + SNAP.kec[k].skor.risiko + "): " + SNAP.kec[k].rekom.filter((_, i) => i > 0 || SNAP.kec[k].skor.lengkap > 0)[0]);
    if (!profil.length) profil = ["Seluruh kecamatan berstatus Normal. Lanjutkan pemantauan rutin dan pastikan data TMA serta kesiapan sumber daya terus diperbarui."];
    profil.push("Pilih satu kecamatan untuk melihat daftar tindakan lengkapnya.");
  }
  return { s: "ada", sumber: SUMBER_ANALISIS, ind: ind, profil: profil, profilJudul: "Tindakan yang disarankan",
    info: "Rekomendasi bersifat umum dan dibuat otomatis dari data; keputusan siaga/evakuasi tetap oleh BPBD HSU." };
}

function mSumberDaya() {
  if (!SNAP) return kosongData(SUMBER_SS, ["Perahu", "Posko", "Relawan", "Pompa"], { form: "kesiapan" });
  const c = pilih(), ada = KEC.filter(k => SNAP.kec[k] && SNAP.kec[k].kes), jml = f => ada.reduce((s, k) => s + (SNAP.kec[k].kes[f] || 0), 0);
  let ind;
  if (c) {
    const k = c.kes, t = k ? k.target : null, fmt = f => k ? fmtN(k[f]) + " / " + fmtN(t[f]) : "—";
    ind = [["Perahu · " + kecAktif, k ? fmtN(k.perahu) : "—", k ? "target " + fmtN(t.perahu) : "belum diinput"], ["Posko", k ? fmtN(k.posko) : "—", k ? "target " + fmtN(t.posko) : ""],
           ["Relawan", k ? fmtN(k.relawan) : "—", k ? "target " + fmtN(t.relawan) : ""], ["Pompa", k ? fmtN(k.pompa) : "—", k ? "target " + fmtN(t.pompa) : ""],
           ["Logistik", k ? fmtN(k.logistik) + " hari" : "—", k ? "target " + fmtN(t.logistik) + " hari" : ""], ["Pemenuhan target", k ? k.pct + "%" : "—", k ? "pembaruan " + k.waktu : ""]];
  } else {
    ind = [["Perahu", ada.length ? fmtN(jml("perahu")) : "—", ada.length + " kecamatan sudah input"], ["Posko", ada.length ? fmtN(jml("posko")) : "—"],
           ["Relawan", ada.length ? fmtN(jml("relawan")) : "—"], ["Pompa", ada.length ? fmtN(jml("pompa")) : "—"]];
  }
  const g0 = grafikKec("Pemenuhan target sumber daya (%)", x => x.kes ? x.kes.pct : null, 0);
  const g1 = grafikKec("Perahu tersedia per kecamatan (unit)", x => x.kes ? x.kes.perahu : null, 0);
  const g2 = grafikKec("Relawan siaga per kecamatan (orang)", x => x.kes ? x.kes.relawan : null, 0);
  return rapikan({ s: "ada", form: "kesiapan", sumber: "Input petugas/BPBD (sheet \"Kesiapan\"); target per kecamatan dari sheet \"Ambang & Target\"", ind: ind,
    info: "Pemenuhan target = rata-rata (tersedia ÷ target, maks 100%) untuk perahu, posko, relawan, pompa, dan logistik. Target bawaan hanyalah contoh; sesuaikan di sheet \"Ambang & Target\"." }, [g0, g1, g2], true);
}

function mCuaca() {
  if (!SNAP) return kosongData(SUMBER_BMKG, ["Suhu rata-rata", "Kelembapan rata-rata", "Angin rata-rata", "Diprakirakan hujan"]);
  const ada = KEC.filter(k => SNAP.kec[k] && SNAP.kec[k].cuaca);
  if (!ada.length) return kosongData(SUMBER_BMKG, ["Suhu rata-rata", "Kelembapan rata-rata", "Angin rata-rata", "Diprakirakan hujan"], { pesan: catatGalat("Data BMKG belum tersedia.") });
  const c = pilih(), cu = c && c.cuaca, avg = f => rataA(ada.map(k => SNAP.kec[k].cuaca[f]));
  const hujan = ada.filter(k => /hujan|petir/i.test(SNAP.kec[k].cuaca.c || ""));
  const ind = cu ? [["Cuaca · " + kecAktif, cu.c || "—", "prakiraan " + String(cu.w || "").slice(11, 16) + " waktu setempat"], ["Suhu udara", fx(cu.t, 1, " °C")], ["Kelembapan", fx(cu.hu, 0, "%")], ["Angin", fx(cu.ws, 1, " km/jam"), cu.wd ? "dari arah " + cu.wd : ""]]
    : [["Suhu rata-rata", fx(avg("t"), 1, " °C"), "rata-rata " + ada.length + " kecamatan"], ["Kelembapan rata-rata", fx(avg("hu"), 0, "%")], ["Angin rata-rata", fx(avg("ws"), 1, " km/jam")],
       ["Diprakirakan hujan/petir", fmtN(hujan.length), "kecamatan pada jam ini"]];
  const g0 = grafikKec("Suhu udara per kecamatan (°C)", x => x.cuaca ? x.cuaca.t : null, 1);
  const g1 = grafikKec("Kelembapan udara per kecamatan (%)", x => x.cuaca ? x.cuaca.hu : null, 0);
  const g2 = grafikKec("Kecepatan angin per kecamatan (km/jam)", x => x.cuaca ? x.cuaca.ws : null, 1);
  return rapikan({ s: "ada", sumber: SUMBER_BMKG, ind: ind,
    info: hujan.length ? "Diprakirakan hujan/petir: " + hujan.join(", ") + "." : "Tidak ada kecamatan yang diprakirakan hujan pada jam ini." }, [g0, g1, g2], true);
}

function mHujan() {
  if (!SNAP) return kosongData(SUMBER_HUJAN, ["Hujan hari ini", "Hujan 3 hari ke depan", "Terbanyak", "Hujan 3 hari terakhir"]);
  const ada = KEC.filter(k => SNAP.kec[k] && SNAP.kec[k].hujan);
  if (!ada.length) return kosongData(SUMBER_HUJAN, ["Hujan hari ini", "Hujan 3 hari ke depan", "Terbanyak", "Hujan 3 hari terakhir"], { pesan: catatGalat("Data curah hujan belum tersedia.") });
  const c = pilih(), h = c && c.hujan, avg = f => rataA(ada.map(k => SNAP.kec[k].hujan[f]));
  const top = ada.reduce((m, k) => SNAP.kec[k].hujan.h3 > SNAP.kec[m].hujan.h3 ? k : m);
  const ind = h ? [["Hujan hari ini · " + kecAktif, fx(h.ini, 1, " mm")], ["3 hari ke depan", fx(h.h3, 1, " mm"), "tertinggi " + fx(h.m1, 1, " mm/hari")],
                   ["7 hari ke depan", fx(h.h7, 1, " mm")], ["3 hari terakhir", fx(h.lalu3, 1, " mm")]]
    : [["Hujan hari ini", fx(avg("ini"), 1, " mm"), "rata-rata kabupaten"], ["3 hari ke depan", fx(avg("h3"), 1, " mm"), "rata-rata kabupaten"],
       ["Terbanyak 3 hari ke depan", top, fx(SNAP.kec[top].hujan.h3, 1, " mm")], ["3 hari terakhir", fx(avg("lalu3"), 1, " mm"), "rata-rata kabupaten"]];
  const harian = h ? h.harian.map(p => ({ d: p.d, v: p.mm })) : seriKab(x => x.hujan ? x.hujan.harian.map(p => ({ d: p.d, v: p.mm })) : []);
  const g0 = grafikKec("Hujan 3 hari ke depan per kecamatan (mm)", x => x.hujan ? x.hujan.h3 : null, 1);
  const g1 = grafikKec("Hujan hari ini per kecamatan (mm)", x => x.hujan ? x.hujan.ini : null, 1);
  const g2 = grafikSeri("Hujan harian — " + (h ? kecAktif : "rata-rata kabupaten") + " (mm), 3 hari lalu s.d. 7 hari ke depan", harian, 1);
  return rapikan({ s: "ada", sumber: SUMBER_HUJAN, ind: ind,
    info: "Kategori BMKG per hari: ringan 5–20, sedang 20–50, lebat 50–100, sangat lebat 100–150, ekstrem > 150 mm. Hujan di hulu (Tabalong, Balangan, Hulu Sungai Tengah) memengaruhi banjir di HSU walau hujan lokal kecil." }, [g0, g1, g2], true);
}

function mTMA() {
  if (!SNAP) return kosongData(SUMBER_TMA, ["Pos melapor (≤ 48 jam)", "TMA tertinggi", "Pembacaan terakhir", "Pos belum melapor"]);
  const c = pilih(), valid = KEC.filter(k => SNAP.kec[k] && SNAP.kec[k].tma && SNAP.kec[k].tma.valid);
  let ind;
  if (c) {
    const t = c.tma, a = c.ambang;
    ind = [["TMA · " + kecAktif, t ? fmtN(t.cm) + " cm" : "—", t ? t.status + " · " + umurTeks(t.umurJam) + (t.valid ? "" : " (kedaluwarsa)") : "belum ada pembacaan"],
           ["Tren", t ? t.tren : "—", t && t.pos ? t.pos : ""], ["Ambang Waspada / Siaga", fmtN(a.waspada) + " / " + fmtN(a.siaga) + " cm", "contoh bila belum diubah"], ["Ambang Awas", fmtN(a.awas) + " cm"]];
  } else {
    const top = valid.length ? valid.reduce((m, k) => SNAP.kec[k].tma.cm > SNAP.kec[m].tma.cm ? k : m) : null;
    const semua = KEC.filter(k => SNAP.kec[k] && SNAP.kec[k].tma), baru = semua.length ? semua.reduce((m, k) => SNAP.kec[k].tma.waktu > SNAP.kec[m].tma.waktu ? k : m) : null;
    ind = [["Pos melapor (≤ 48 jam)", valid.length + " / " + KEC.length], ["TMA tertinggi", top ? fmtN(SNAP.kec[top].tma.cm) + " cm" : "—", top ? top + " · " + SNAP.kec[top].tma.status : ""],
           ["Pembacaan terakhir", baru ? SNAP.kec[baru].tma.waktu.slice(11) : "—", baru ? baru + " · " + SNAP.kec[baru].tma.waktu.slice(0, 10) : ""], ["Pos belum melapor", fmtN(KEC.length - valid.length), "tidak dihitung dalam skor"]];
  }
  const g0 = grafikKec("Tinggi muka air terakhir (cm)", x => x.tma && x.tma.valid ? x.tma.cm : null, 0);
  const g1 = grafikKec("TMA terhadap ambang Siaga (%)", x => x.tma && x.tma.valid ? Math.round(x.tma.cm / x.ambang.siaga * 100) : null, 0);
  return rapikan({ s: "ada", sumber: SUMBER_TMA, ind: ind,
    info: valid.length ? "Hanya pembacaan ≤ 48 jam yang dihitung. Ambang di sheet \"Ambang & Target\" perlu diisi sesuai ambang resmi pos duga." : "Belum ada pembacaan TMA dalam 48 jam terakhir. Buka modul Input Pembacaan untuk menambah." }, [g0, g1], true);
}

function mInputTMA() {
  const semua = SNAP ? KEC.filter(k => SNAP.kec[k] && SNAP.kec[k].tma) : [], baru = semua.length ? semua.reduce((m, k) => SNAP.kec[k].tma.waktu > SNAP.kec[m].tma.waktu ? k : m) : null;
  return { s: "ada", form: "tma", sumber: SUMBER_TMA,
    ind: [["Pembacaan terakhir", baru ? fmtN(SNAP.kec[baru].tma.cm) + " cm" : "—", baru ? baru + " · " + SNAP.kec[baru].tma.waktu : "belum ada"]],
    info: "Isi sesuai angka yang terbaca pada papan duga (peilschaal) pada waktu pembacaan. Setiap pengiriman tersimpan permanen di spreadsheet dan langsung memperbarui analisis." };
}

function indDebit() {
  const ada = KEC.filter(k => SNAP.kec[k] && SNAP.kec[k].debit), c = pilih(), d = c && c.debit;
  if (d) return [["Debit sekarang · " + kecAktif, fx(d.now, 1, " m³/s")], ["Rata-rata 7 hari terakhir", fx(d.base, 1, " m³/s")],
                 ["Puncak 7 hari ke depan", fx(d.max7, 1, " m³/s"), d.tglMax ? tglIndo(d.tglMax) : ""], ["Rasio puncak ÷ rata-rata", d.rasio != null ? fmtN(d.rasio, 2) + "×" : "—", "2× = skor debit penuh"]];
  const naik = ada.filter(k => SNAP.kec[k].debit.rasio != null).sort((a, b) => SNAP.kec[b].debit.rasio - SNAP.kec[a].debit.rasio);
  return [["Debit rata-rata sekarang", fx(rataA(ada.map(k => SNAP.kec[k].debit.now)), 1, " m³/s"), "rata-rata " + ada.length + " titik"],
          ["Kenaikan terbesar", naik.length ? fmtN(SNAP.kec[naik[0]].debit.rasio, 2) + "×" : "—", naik.length ? naik[0] : ""],
          ["Naik > 50%", fmtN(naik.filter(k => SNAP.kec[k].debit.rasio >= 1.5).length), "kecamatan, puncak 7 hari ke depan"],
          ["Kecamatan terpantau", ada.length + " / " + KEC.length]];
}
function mDebit() {
  if (!SNAP) return kosongData(SUMBER_DEBIT, ["Debit sekarang", "Kenaikan terbesar", "Naik > 50%", "Kecamatan terpantau"]);
  if (!KEC.some(k => SNAP.kec[k] && SNAP.kec[k].debit)) return kosongData(SUMBER_DEBIT, ["Debit sekarang", "Kenaikan terbesar", "Naik > 50%", "Kecamatan terpantau"], { pesan: catatGalat("Data debit belum tersedia.") });
  const g0 = grafikKec("Rasio puncak debit 7 hari ke depan ÷ rata-rata 7 hari terakhir (×)", x => x.debit ? x.debit.rasio : null, 2);
  const g1 = grafikKec("Debit sungai sekarang (m³/s)", x => x.debit ? x.debit.now : null, 1);
  return rapikan({ s: "ada", sumber: SUMBER_DEBIT, ind: indDebit(),
    info: "Debit ini simulasi model global pada sel ±5 km, bukan pengukuran. Di rawa bergradien landai nilainya bisa kurang mewakili; gunakan sebagai pembanding tren dan cocokkan dengan TMA lapangan." }, [g0, g1], true);
}
function mTrenDebit() {
  if (!SNAP) return kosongData(SUMBER_DEBIT, ["Debit sekarang", "Rata-rata 7 hari terakhir", "Puncak 7 hari ke depan", "Rasio"]);
  if (!KEC.some(k => SNAP.kec[k] && SNAP.kec[k].debit)) return kosongData(SUMBER_DEBIT, ["Debit sekarang", "Kenaikan terbesar", "Naik > 50%", "Kecamatan terpantau"], { pesan: catatGalat("Data debit belum tersedia.") });
  const c = pilih(), d = c && c.debit;
  const seri = d ? d.seri.map(p => ({ d: p.d, v: p.q })) : seriKab(x => x.debit ? x.debit.seri.map(p => ({ d: p.d, v: p.q })) : []);
  return rapikan({ s: "ada", sumber: SUMBER_DEBIT, ind: indDebit(), info: "Tanggal terakhir pada grafik adalah prakiraan model; 7 tanggal pertama adalah simulasi hari-hari yang sudah lewat." },
    [grafikSeri("Debit sungai — " + (d ? kecAktif : "rata-rata kabupaten") + " (m³/s)", seri, 1)], false);
}

function rekapHariIni() {
  if (!REKAP || !REKAP.baris.length) return null;
  const tgl = REKAP.baris.reduce((m, r) => r.t > m ? r.t : m, "");
  return { tgl: tgl, baris: REKAP.baris.filter(r => r.t === tgl) };
}
function mRekap() {
  const aksi = [{ id: "csv", teks: "Unduh rekap (CSV)" }], link = SPREADSHEET_URL ? { url: SPREADSHEET_URL, teks: "Buka spreadsheet laporan" } : null;
  if (!REKAP) return kosongData(SUMBER_SS, ["Tanggal rekap", "Kecamatan terekap", "Skor risiko tertinggi", "Rekaman 14 hari"], { aksi: aksi, link: link });
  const h = rekapHariIni();
  if (!h) return { s: "ada", sumber: SUMBER_SS, ind: [["Tanggal rekap", "—"], ["Kecamatan terekap", "—"]], info: "Rekap harian belum berisi data. Jalankan setup() atau tunggu trigger 3 jam berikutnya.", link: link };
  const per = n => h.baris.filter(r => r.kec === n)[0];
  const top = h.baris.slice().sort((a, b) => (b.risiko || 0) - (a.risiko || 0))[0];
  const g = (judul, f, dec, extra) => { const l = [], v = []; KEC.forEach(k => { const r = per(k); const x = r ? f(r) : null; if (x != null) { l.push(k); v.push(x); } }); return l.length ? Object.assign({ judul: judul, labels: l, values: v, dec: dec || 0 }, extra || {}) : null; };
  return rapikan({ s: "ada", sumber: SUMBER_SS, aksi: aksi, link: link,
    ind: [["Tanggal rekap", tglIndo(h.tgl)], ["Kecamatan terekap", h.baris.length + " / " + KEC.length], ["Skor risiko tertinggi", top ? fmtN(top.risiko) : "—", top ? top.kec + " · " + top.status : ""], ["Rekaman 14 hari", fmtN(REKAP.baris.length), "baris rekap harian"]],
    info: "Nilai harian = nilai tertinggi dari seluruh rekaman hari itu. Data lengkap per 3 jam ada di sheet \"Pemantauan\"." },
    [g("Skor risiko maksimum hari ini per kecamatan (0–100)", r => r.risiko, 0, { skala: "risiko" }), g("Hujan hari ini per kecamatan (mm)", r => r.hujan, 1),
     g("TMA tertinggi hari ini (cm)", r => r.tma, 0), g("Kesiapan sumber daya (%)", r => r.kes, 0)], true);
}
function mRiwayat() {
  if (!REKAP) return kosongData(SUMBER_SS, ["Skor risiko tertinggi", "Hujan tertinggi", "Hari tercatat"]);
  const sel = typeof kecAktif !== "undefined" ? kecAktif : null;
  const rows = REKAP.baris.filter(r => !sel || r.kec === sel);
  if (!rows.length) return { s: "ada", sumber: SUMBER_SS, ind: [["Hari tercatat", "0"]], info: "Belum ada rekap untuk pilihan ini." };
  const tgls = Array.from(new Set(rows.map(r => r.t))).sort();
  const seri = f => tgls.map(t => { const v = rows.filter(r => r.t === t).map(f).filter(x => x != null); return v.length ? { d: t, v: Math.max.apply(null, v) } : null; }).filter(Boolean);
  const rs = seri(r => r.risiko), hs = seri(r => r.hujan), ts = seri(r => r.tma);
  const mx = a => a.length ? a.reduce((m, p) => p.v > m.v ? p : m) : null, mr = mx(rs), mh = mx(hs);
  const nama = sel || "kabupaten (tertinggi dari semua kecamatan)";
  return rapikan({ s: "ada", sumber: SUMBER_SS,
    ind: [["Skor risiko tertinggi", mr ? fmtN(mr.v) : "—", mr ? tglIndo(mr.d) : ""], ["Hujan harian tertinggi", mh ? fmtN(mh.v, 1) + " mm" : "—", mh ? tglIndo(mh.d) : ""],
          ["Hari tercatat", fmtN(tgls.length), "dalam 14 hari terakhir"], ["Hari berstatus Siaga/Awas", fmtN(tgls.filter(t => rows.some(r => r.t === t && LV[r.status] >= 2)).length), sel || "semua kecamatan"]],
    info: sel ? "Pilih kecamatan yang sama lagi pada peta untuk kembali ke tampilan kabupaten." : "Klik kecamatan pada peta untuk melihat riwayatnya sendiri." },
    [grafikSeri("Skor risiko harian — " + nama + " (0–100)", rs, 0), grafikSeri("Hujan harian — " + nama + " (mm)", hs, 1), grafikSeri("TMA tertinggi harian — " + nama + " (cm)", ts, 0)], false);
}

// Urutan DATA[idBidang][n] mengikuti urutan modul pada BIDANG. Tiap entri berupa fungsi yang dievaluasi saat panel digambar.
const DATA = {
  kesiapan: [mStatus, mRekomendasi, mSumberDaya],
  cuaca: [mCuaca, mHujan],
  tma: [mTMA, mInputTMA],
  debit: [mDebit, mTrenDebit],
  laporan: [mRekap, mRiwayat]
};

// ---------- Pemuatan data dari Apps Script ----------
async function ambilAPI(q) {
  const r = await fetch(API_BANJIR + (API_BANJIR.indexOf("?") < 0 ? "?" : "&") + q);
  if (!r.ok) throw new Error("HTTP " + r.status);
  const j = await r.json();
  if (j.error) throw new Error(j.error);
  return j;
}
function setUpd() {
  const el = document.getElementById("upd"); if (!el) return;
  if (!API_BANJIR) { el.textContent = "API belum disambungkan"; el.classList.add("galat"); return; }
  if (!SNAP) { el.textContent = GALAT_API ? "Data gagal dimuat" : "Data: memuat…"; el.classList.toggle("galat", !!GALAT_API); return; }
  const bad = (SNAP.galat || []).length;
  el.textContent = "Data: " + SNAP.diperbarui.slice(11) + " WITA" + (bad ? " · ⚠ " + bad + " sumber bermasalah" : "") + (GALAT_API ? " · pembaruan gagal" : "");
  el.classList.toggle("galat", !!(bad || GALAT_API));
}
async function muatSnapshot() {
  if (!API_BANJIR) { setUpd(); return; }
  try { SNAP = await ambilAPI("d=data"); GALAT_API = null; }
  catch (e) { GALAT_API = e && e.message ? e.message : String(e); console.warn("Snapshot gagal dimuat:", e); }
  setUpd(); if (typeof segarkanPanel === "function") segarkanPanel();
}
async function muatRekap() {
  if (!API_BANJIR) return;
  try { REKAP = await ambilAPI("d=rekap&hari=14"); if (typeof segarkanPanel === "function") segarkanPanel(); }
  catch (e) { console.warn("Rekap gagal dimuat:", e); }
}
function iniData() {
  setUpd(); muatSnapshot(); muatRekap();
  setInterval(muatSnapshot, 10 * 60 * 1000); setInterval(muatRekap, 30 * 60 * 1000);
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
    setUpd(); muatRekap(); segarkanPanel(true);
  } catch (e) {
    toast("Gagal menyimpan: " + (e && e.message ? e.message : e), "err");
    btn.disabled = false; btn.textContent = lama;
  }
}
