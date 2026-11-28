/* ================================================================
 * DESTANA (Desa/Kelurahan Tanggap Bencana) HSU — tampilan dashboard satu halaman
 * Data: SNAP (snapshot) dan REKAP (rekap harian) dari data-modul.js; peta Leaflet; grafik SVG tanpa pustaka tambahan.
 * ================================================================ */

// tampilkan galat skrip di halaman agar mudah dilacak (bila ada)
window.addEventListener("error", e => {
  const b = document.getElementById("banner"); if (!b) return;
  b.className = "banner lv3"; b.style.display = "block";
  b.innerHTML = "<b>Galat skrip:</b> " + String(e.message || "").replace(/[<>&]/g, "") + " <small>(" + String(e.filename || "").split("/").pop() + ":" + (e.lineno || "?") + ")</small>";
});
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
const $ = id => document.getElementById(id);
const IKON_TETES = '<svg viewBox="0 0 24 24"><path d="M12 2.5c3.6 4.2 6 7.4 6 10.6A6 6 0 0 1 6 13.1c0-3.200 2.400-6.400 6-10.600z"/></svg>';

let kecAktif = null;      // kecamatan yang dipilih (null = ringkasan kabupaten)
let EKSPOR = false;       // true saat membuat gambar JPG (tata letak khusus 2 halaman)
const HAL_L = 900, HAL_T = [1500, 1273];   // lebar dan tinggi gambar 1 dan 2 (samakan dengan style.css); disimpan 2x lebih tajam

function toast(teks, jenis) {
  const el = $("toast"); el.textContent = teks;
  el.className = "toast tampil " + (jenis === "err" ? "err" : "ok");
  clearTimeout(toast._t); toast._t = setTimeout(() => el.classList.remove("tampil"), jenis === "err" ? 6500 : 3500);
}

const C = k => (SNAP && SNAP.kec) ? SNAP.kec[k] || null : null;
const adaKec = () => KEC.filter(k => C(k));

// ================= PETA =================
const map = L.map("map", { attributionControl: false, zoomControl: false, preferCanvas: true, zoomSnap: 0.25, zoomDelta: 0.5, scrollWheelZoom: false, dragging: !L.Browser.mobile }).setView([-2.42, 115.2], 10);
L.control.zoom({ position: "bottomright" }).addTo(map);
map.on("click", () => map.scrollWheelZoom.enable());
map.on("mouseout", () => map.scrollWheelZoom.disable());
const ubin = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "&copy; OpenStreetMap contributors", maxZoom: 19, crossOrigin: true }).addTo(map);

const cincin = f => f.geometry.coordinates.map(c => [c[1], c[0]]);
const fitur = lv => BATAS_HSU_GEOJSON.features.filter(f => f.properties && f.properties.level === lv);
const poligonKec = {};
const GAYA_NETRAL = { color: "#27424e", weight: 1.2, opacity: 1, dashArray: "5 4", fillColor: "#b8c4c9", fillOpacity: 0.3 };

const lapKec = L.layerGroup();
fitur("kecamatan").forEach(f => {
  const n = f.properties.name;
  const p = L.polygon(cincin(f), GAYA_NETRAL).addTo(lapKec);
  poligonKec[n] = p;
  p.bindTooltip(() => tipKec(n), { sticky: true });
  p.on("click", () => pilihKecamatan(n));
});
lapKec.addTo(map);
const batasKab = L.polygon(cincin(fitur("kabupaten")[0]), { color: "#000", weight: 2, opacity: 1, fill: false, interactive: false }).addTo(map);

function tipKec(n) {
  const c = C(n);
  return "<b>" + esc(n) + "</b>" + (c ? "<br>" + esc(c.skor.status) + " · skor " + c.skor.risiko : "<br>Data belum tersedia");
}

// label kecamatan (nama + skor), diatur agar tidak saling menimpa
const labelKec = [];
function susunLabel(items) {
  const GAP = 3, terpasang = [], hasil = [];
  const tabrak = (a, b) => Math.abs(a.x - b.x) < (a.w + b.w) / 2 + GAP && Math.abs(a.y - b.y) < (a.h + b.h) / 2 + GAP;
  items.forEach(it => {
    const h = it.h + GAP, kandidat = [[0, 0]];
    for (let r = 1; r <= 4; r++) [-1, 0, 1].forEach(iy => [-2, -1, 0, 1, 2].forEach(ix => { if (iy || ix) kandidat.push([ix * r * 22, iy * r * h]); }));
    kandidat.sort((a, b) => Math.hypot(a[0], a[1]) - Math.hypot(b[0], b[1]));
    let pilih = kandidat[0];
    for (const [dx, dy] of kandidat) {
      const box = { x: it.x + dx, y: it.y + dy, w: it.w, h: it.h };
      if (!terpasang.some(t => tabrak(box, t))) { pilih = [dx, dy]; break; }
    }
    terpasang.push({ x: it.x + pilih[0], y: it.y + pilih[1], w: it.w, h: it.h });
    hasil.push({ dx: pilih[0], dy: pilih[1] });
  });
  return hasil;
}
function aturLabel() {
  if (!labelKec.length) return;
  const ctx = document.createElement("canvas").getContext("2d");
  ctx.font = "800 12.5px Arial";
  const items = labelKec.map(l => {
    const p = map.latLngToContainerPoint([l.lat, l.lon]);
    return { x: p.x, y: p.y, w: ctx.measureText(l.name).width + 8, h: 30 };
  });
  const urut = items.map((_, i) => i).sort((i, j) => items[i].y - items[j].y || items[i].x - items[j].x);
  const off = susunLabel(urut.map(i => items[i]));
  urut.forEach((i, k) => {
    const el = labelKec[i].marker.getElement();
    if (el && el.firstChild) el.firstChild.style.transform = "translate(-50%,-50%) translate(" + off[k].dx + "px," + off[k].dy + "px)";
  });
}
function bangunLabel() {
  LABEL_KECAMATAN_HSU.forEach(item => {
    const marker = L.marker([Number(item.lat), Number(item.lon)], {
      icon: L.divIcon({ className: "kml-label", html: '<div class="lbl"></div>', iconSize: [1, 1], iconAnchor: [0, 0] }),
      interactive: false, keyboard: false, zIndexOffset: 1000
    }).addTo(map);
    labelKec.push({ name: item.name, lat: Number(item.lat), lon: Number(item.lon), marker: marker });
  });
  map.on("zoomend moveend", aturLabel);
}
function isiLabel() {
  labelKec.forEach(l => {
    const el = l.marker.getElement(); if (!el || !el.firstChild) return;
    const c = C(l.name);
    el.firstChild.innerHTML = "<b>" + esc(l.name) + "</b>" + (c ? '<i style="background:' + WARNA_LV[LV[c.skor.status]] + (c.skor.status === "Waspada" ? ";color:#3b3000" : "") + '">' + c.skor.risiko + "</i>" : "");
  });
  aturLabel();
}

function gayaKec(n) {
  const c = C(n), sel = n === kecAktif;
  const dasar = c ? { color: "#27424e", weight: 1.2, opacity: 1, dashArray: "5 4", fillColor: WARNA_LV[LV[c.skor.status]], fillOpacity: 0.55 } : GAYA_NETRAL;
  return sel ? Object.assign({}, dasar, { color: "#0a1f2b", weight: 3.5, dashArray: null, fillOpacity: 0.7 }) : dasar;
}
function warnaiPeta() { Object.keys(poligonKec).forEach(n => poligonKec[n].setStyle(gayaKec(n))); if (kecAktif) poligonKec[kecAktif].bringToFront(); }

function opsiPandang() {
  if (EKSPOR) return { paddingTopLeft: [362, 62], paddingBottomRight: [14, 212], maxZoom: 14, animate: false };
  const w = map.getSize().x;
  return { paddingTopLeft: [w > 1000 ? 375 : 12, 10], paddingBottomRight: [w > 1000 ? 175 : 12, w > 1000 ? 200 : 14], maxZoom: 14, animate: false };
}
function paskanPeta(animasi) {
  if (!map.getContainer().offsetWidth) return;   // peta sedang disembunyikan
  map.invalidateSize({ pan: false });
  const o = opsiPandang(), b = kecAktif ? poligonKec[kecAktif].getBounds() : batasKab.getBounds();
  try {
    // cari zoom terbesar (kelipatan 0,25) yang masih memuat seluruh wilayah di area yang tidak tertutup kartu
    const sz = map.getSize(), pl = o.paddingTopLeft, pr = o.paddingBottomRight;
    const aw = sz.x - pl[0] - pr[0], ah = sz.y - pl[1] - pr[1];
    if (aw < 100 || ah < 100) throw new Error("area kecil");
    let z = 8;
    for (let t = 14.5; t >= 8; t -= 0.25) {
      const a = map.project(b.getNorthWest(), t), c = map.project(b.getSouthEast(), t);
      if (Math.abs(c.x - a.x) <= aw && Math.abs(c.y - a.y) <= ah) { z = t; break; }
    }
    const a = map.project(b.getNorthWest(), z), c = map.project(b.getSouthEast(), z);
    const tengah = L.point((a.x + c.x) / 2, (a.y + c.y) / 2);
    const P = L.point(pl[0] + aw / 2, pl[1] + ah / 2), C = L.point(sz.x / 2, sz.y / 2);
    map.setView(map.unproject(tengah.subtract(P.subtract(C)), z), z, { animate: !!animasi });
  } catch (e) {
    o.animate = !!animasi; map.fitBounds(b, o);
  }
}

function pilihKecamatan(n) {
  kecAktif = (kecAktif === n || !n) ? null : n;
  render(); paskanPeta(true);
}

// ================= RENDER =================
function render() {
  renderKop(); renderBanner(); renderKPI(); renderIndikator(); renderOverlay(); renderPetaUpdate();
  renderTabel(); renderHujan(); renderDebit(); renderJam(); renderSumber();
}

function pesanData() {
  if (!API_BANJIR) return "API belum disambungkan. Isi API_BANJIR di data-modul.js setelah Kode.gs dideploy sebagai Web App.";
  if (GALAT_API) return "Data belum dapat dimuat: " + GALAT_API;
  return "Memuat data…";
}

function renderKop() {
  const d = new Date();
  $("tgl").textContent = d.toLocaleDateString("id-ID", { timeZone: "Asia/Makassar", weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const u = $("upd");
  if (!SNAP) { u.textContent = !API_BANJIR ? "API belum disambungkan" : GALAT_API ? "Data gagal dimuat" : "Update data: memuat…"; u.className = (!API_BANJIR || GALAT_API) ? "galat" : ""; return; }
  const bad = (SNAP.galat || []).length;
  u.textContent = "Update data: " + SNAP.diperbarui.slice(11).replace(":", ".") + " WITA" + (bad ? " · ⚠ " + bad + " sumber bermasalah" : "") + (GALAT_API ? " · pembaruan gagal" : "");
  u.className = (bad || GALAT_API) ? "galat" : "";
}

function renderBanner() {
  const el = $("banner");
  if (!SNAP) { el.className = "banner info"; el.innerHTML = '<div><b>' + esc(pesanData()) + '</b></div>'; return; }
  const r = SNAP.ringkas, t = r.teratas[0], ks = adaKec();
  const nTma = ks.filter(k => C(k).tma && C(k).tma.valid).length;
  el.className = "banner lv" + LV[r.tertinggi];
  el.innerHTML = '<span class="chip">' + esc(r.tertinggi.toUpperCase()) + '</span>' +
    '<div><b>Tingkat siaga tertinggi di kabupaten: ' + esc(r.tertinggi) + '</b><span class="k">' + (t ? esc(t.n) + " · skor risiko " + t.skor + " dari 100" : "") + '</span></div>' +
    '<div class="ket">TMA terukur (≤ 48 jam): ' + nTma + ' dari ' + ks.length + ' kecamatan.' +
    (nTma < ks.length ? " Tanpa TMA terukur, status dinilai dari hujan dan debit model (maksimal Siaga)." : "") + '</div>';
}

function renderKPI() {
  const urutan = [3, 2, 1, 0], ks = adaKec();
  $("kpi").innerHTML = urutan.map(lv => {
    const nama = NAMA_LV[lv], n = SNAP ? SNAP.ringkas.hitung[nama] : null;
    const daftar = SNAP ? ks.filter(k => C(k).skor.status === nama) : [];
    return '<div class="kpi-kartu lv' + lv + '"><div class="kpi-ikon"><i>' + IKON_TETES + '</i></div><div class="kpi-isi">' +
      '<div class="lb">' + nama + '</div><div class="angka">' + (n == null ? "—" : n) + '</div>' +
      '<div class="sm">' + (n == null ? "kecamatan" : "kecamatan · " + fmtN(n / (ks.length || 1) * 100, 0) + "%") + '</div>' +
      '<div class="nm" title="' + esc(daftar.join(", ")) + '">' + (daftar.length ? esc(daftar.join(", ")) : "&nbsp;") + '</div></div></div>';
  }).join("");
}

function renderIndikator() {
  const ks = adaKec();
  const maks = f => ks.reduce((m, k) => { const v = f(C(k)); return v != null && !isNaN(v) && (m == null || v > m.v) ? { k: k, v: v } : m; }, null);
  const rata = f => SNAP ? rataA(ks.map(k => f(C(k)))) : null;
  const j1 = maks(c => c.hujan && c.hujan.jam1), j24 = maks(c => c.hujan && c.hujan.jam24), h3 = maks(c => c.hujan && c.hujan.h3);
  const tma = maks(c => c.tma && c.tma.valid ? c.tma.cm : null), deb = maks(c => c.debit && c.debit.max7);
  const kd = deb ? C(deb.k).debit : null;
  const kartu = (lb, nilai, sat, sm) => '<div class="ind"><div class="lb">' + lb + '</div><div class="nilai">' + nilai + (sat ? "<small>" + sat + "</small>" : "") + '</div><div class="sm">' + sm + '</div></div>';
  const tertinggi = (m, sat) => m ? "rata-rata · tertinggi " + esc(m.k) + " " + fx(m.v, 1) + " " + sat : "rata-rata kabupaten";
  $("indikator").innerHTML =
    kartu("Hujan 1 jam terakhir", fx(rata(c => c.hujan && c.hujan.jam1), 1), "mm", tertinggi(j1, "mm")) +
    kartu("Hujan 24 jam terakhir", fx(rata(c => c.hujan && c.hujan.jam24), 1), "mm", tertinggi(j24, "mm")) +
    kartu("Hujan 3 hari ke depan", fx(rata(c => c.hujan && c.hujan.h3), 1), "mm", tertinggi(h3, "mm")) +
    kartu("Debit puncak 7 hari", deb ? fx(deb.v, 1) : "—", deb ? "m³/s" : "", deb ? esc(deb.k) + " · " + (kd && kd.rasio != null ? fx(kd.rasio, 2) + "× rata-rata" : "model GloFAS") : "menunggu data") +
    kartu("Tinggi muka air", tma ? fx(tma.v, 0) : "—", tma ? "cm" : "", tma ? "tertinggi · " + esc(tma.k) : (SNAP ? "belum diinput (opsional)" : "menunggu data"));
}

// ----- hujan hari ini (sudah dan sedang terjadi) per kecamatan -----
function hujanHariIni(c) {
  const h = c && c.hujan; if (!h || !h.jam || !h.jamMulai) return null;
  const t0 = new Date(h.jamMulai + ":00Z").getTime(), hari = tglWITA(0), iIni = Math.min(23, h.jam.length - 1);
  let tot = 0; const list = [];
  for (let i = 0; i <= iIni; i++) {
    const iso = new Date(t0 + i * 36e5).toISOString();
    if (iso.slice(0, 10) !== hari) continue;
    const mm = h.jam[i] || 0; tot += mm;
    if (mm >= 0.1) list.push({ j: iso.slice(11, 13) + ".00", mm: mm });
  }
  return { tot: tot, n: list.length, awal: list.length ? list[0].j : null, sedang: (h.jam[iIni] || 0) >= 0.1, list: list };
}
const KAT_KELAS = mm => mm < 0.1 ? 0 : mm < 5 ? 1 : mm < 20 ? 2 : mm < 50 ? 3 : 4;
const KATEGORI_HARIAN = mm => mm < 0.1 ? "Tidak hujan" : mm < 5 ? "Sangat ringan" : mm < 20 ? "Ringan" : mm < 50 ? "Sedang" : mm < 100 ? "Lebat" : mm < 150 ? "Sangat lebat" : "Ekstrem";
function tabelHujanHariIni() {
  if (!SNAP) return '<span style="color:#5d6f78">' + esc(pesanData()) + '</span>';
  const ks = (kecAktif ? [kecAktif] : adaKec().slice()).map(k => ({ k: k, d: hujanHariIni(C(k)) }));
  if (!ks.some(x => x.d)) return '<span style="color:#5d6f78">Data hujan per jam belum tersedia. Perbarui Kode.gs ke versi terbaru lalu deploy versi baru.</span>';
  ks.sort((a, b) => ((b.d && b.d.tot) || 0) - ((a.d && a.d.tot) || 0) || a.k.localeCompare(b.k));
  let isi;
  if (kecAktif) {
    const d = ks[0].d;
    isi = !d || !d.n ? '<tr class="nol"><td>' + esc(kecAktif) + '</td><td colspan="2">Belum ada hujan hari ini</td></tr>'
      : d.list.map((x, i) => '<tr><td>' + (i ? "" : esc(kecAktif)) + '</td><td>' + x.j + '</td><td>' + fx(x.mm, 1) + ' mm</td></tr>').join("") +
        '<tr class="tot"><td>Total</td><td>' + d.n + ' jam' + (d.sedang ? ' <span class="sdg">●</span>' : "") + '</td><td><b>' + fx(d.tot, 1) + '</b> mm <span class="kat k' + KAT_KELAS(d.tot) + '">' + KATEGORI_HARIAN(d.tot) + '</span></td></tr>';
  } else {
    isi = ks.map(x => {
      const d = x.d;
      if (!d) return '<tr class="nol"><td>' + esc(x.k) + '</td><td colspan="2">Data belum tersedia</td></tr>';
      if (!d.n) return '<tr class="nol"><td>' + esc(x.k) + '</td><td colspan="2">Belum ada hujan hari ini</td></tr>';
      return '<tr><td>' + esc(x.k) + '</td><td>' + d.n + ' jam' + (d.sedang ? ' <span class="sdg" title="sedang hujan">●</span>' : "") + '</td><td><b>' + fx(d.tot, 1) + '</b> mm <span class="kat k' + KAT_KELAS(d.tot) + '">' + KATEGORI_HARIAN(d.tot) + '</span></td></tr>';
    }).join("");
  }
  return '<div class="hj-bungkus' + (kecAktif ? ' gulir' : '') + '"><table class="hj-tbl"><thead><tr><th>Kecamatan</th><th>' + (kecAktif ? "Jam" : "Lama hujan") + '</th><th>Curah hujan</th></tr></thead><tbody>' + isi + '</tbody></table></div>' +
    '<div class="hj-cat"><span class="sdg">●</span> = sedang hujan. Data 00.00 s.d. jam ini (WITA), pembaruan ' + esc(SNAP.diperbarui.slice(11, 16).replace(":", ".")) + '. Jam hujan ≥ 0,1 mm. Estimasi model; klik kecamatan untuk rincian.</div>';
}

// ----- kartu di atas peta -----
function modus(a) { const m = {}; let b = null; a.filter(Boolean).forEach(x => { m[x] = (m[x] || 0) + 1; if (b == null || m[x] > m[b]) b = x; }); return b; }

function renderOverlay() {
  const ks = adaKec(), sel = kecAktif ? C(kecAktif) : null;
  // --- cuaca ---
  const cu = k => C(k) && C(k).cuaca;
  const dari = sel ? [sel.cuaca].filter(Boolean) : ks.map(cu).filter(Boolean);
  let cuaca;
  if (!dari.length) cuaca = '<div class="ov-isi" style="color:#5d6f78">' + (SNAP ? "Prakiraan BMKG belum tersedia." : esc(pesanData())) + '</div>';
  else {
    const t = rataA(dari.map(x => x.t)), hu = rataA(dari.map(x => x.hu)), ws = rataA(dari.map(x => x.ws));
    const kond = sel ? sel.cuaca.c : modus(dari.map(x => x.c)), hujan = dari.filter(x => /hujan|petir/i.test(x.c || "")).length;
    cuaca = '<div class="ov-isi"><div class="cuaca-atas"><span class="suhu">' + fx(t, 1) + '°C</span><span class="kond">' + esc(kond || "—") +
      '<small>' + (sel ? "desa wakil: " + esc(sel.cuaca.desa || "-") : (hujan ? "hujan di " + hujan + " dari " + dari.length + " kecamatan" : "tidak ada hujan diprakirakan")) + '</small></span></div>' +
      '<div class="cuaca-baris"><span><b>' + fx(hu, 0) + '%</b>kelembapan</span><span><b>' + fx(ws, 1) + '</b>km/jam angin</span><span><b>' +
      (sel ? fx(sel.hujan && sel.hujan.ini, 1) : fx(rataA(ks.map(k => C(k).hujan && C(k).hujan.ini)), 1)) + '</b>mm hujan hari ini</span></div></div>';
  }
  $("ovCuaca").innerHTML = '<div class="ov-judul">Cuaca · ' + (kecAktif ? esc(kecAktif) : "Kabupaten HSU") + '<small>BMKG</small></div>' + cuaca;

  // --- hujan hari ini per kecamatan: lama dan curah hujan ---
  $("ovRekom").innerHTML = '<div class="ov-judul">Hujan Hari Ini per Kecamatan<small>sudah &amp; sedang terjadi</small></div><div class="ov-isi">' + tabelHujanHariIni() + '</div>';
}

function renderPetaUpdate() {
  warnaiPeta(); isiLabel();
  $("legenda").innerHTML = [3, 2, 1, 0].map(lv => '<div><i style="background:' + WARNA_LV[lv] + '"></i>' + NAMA_LV[lv] + ' (' + ["0–24", "25–49", "50–74", "75–100"][lv] + ')</div>').join("") +
    '<div><span class="gb"></span>Batas kabupaten</div><div><span class="gd"></span>Batas kecamatan</div>';
}

// ================= TABEL =================
function renderTabel() {
  const el = $("tabel");
  if (!SNAP) { el.innerHTML = '<div class="kosong">' + esc(pesanData()) + '</div>'; return; }
  const ks = adaKec().sort((a, b) => C(b).skor.risiko - C(a).skor.risiko || a.localeCompare(b));
  const baris = ks.map(k => {
    const c = C(k), lv = LV[c.skor.status], h = c.hujan || {}, d = c.debit || {}, cu = c.cuaca;
    return '<tr data-kec="' + esc(k) + '"' + (k === kecAktif ? ' class="aktif"' : "") + '>' +
      '<td class="kec">' + esc(k) + '</td>' +
      '<td class="t">' + (cu ? esc(cu.c) + '<span class="sm-muted">' + fx(cu.t, 1) + "°C · " + fx(cu.hu, 0) + "%</span>" : "—") + '</td>' +
      '<td>' + fx(h.jam1, 1) + '</td><td>' + fx(h.jam24, 1) + '</td><td>' + fx(h.h3, 1) + '</td>' +
      '<td>' + fx(d.now, 1) + '<span class="sm-muted">puncak ' + fx(d.max7, 1) + '</span></td>' +
      '<td>' + (c.tma && c.tma.valid ? fx(c.tma.cm, 0) + '<span class="sm-muted">' + esc(c.tma.status) + '</span>' : '—') + '</td>' +
      '<td><div class="skor-sel"><b>' + c.skor.risiko + '</b><span class="mini"><i style="width:' + c.skor.risiko + '%;background:' + WARNA_LV[lv] + '"></i></span></div></td>' +
      '<td><span class="lencana lv' + lv + '">' + esc(c.skor.status) + '</span></td></tr>';
  }).join("");
  const r = SNAP.ringkas, mx = f => { const v = ks.map(k => f(C(k))).filter(x => x != null && !isNaN(x)); return v.length ? Math.max.apply(null, v) : null; };
  el.innerHTML = '<table class="tb"><thead><tr><th class="t">Kecamatan</th><th class="t">Cuaca (BMKG)</th><th>Hujan 1 jam</th><th>Hujan 24 jam</th><th>Hujan 3 hari</th><th>Debit</th><th>TMA</th><th>Skor</th><th>Status</th></tr></thead><tbody>' + baris +
    '</tbody><tfoot><tr><td>Kabupaten</td><td class="t"></td><td>' + fx(rataA(ks.map(k => C(k).hujan && C(k).hujan.jam1)), 1) + '</td><td>' + fx(rataA(ks.map(k => C(k).hujan && C(k).hujan.jam24)), 1) + '</td><td>' + fx(rataA(ks.map(k => C(k).hujan && C(k).hujan.h3)), 1) + '</td>' +
    '<td>' + fx(mx(c => c.debit && c.debit.now), 1) + '</td><td>' + fx(mx(c => c.tma && c.tma.valid ? c.tma.cm : null), 0) + '</td><td>' + r.rataSkor + '</td><td><span class="lencana lv' + LV[r.tertinggi] + '">' + esc(r.tertinggi) + '</span></td></tr></tfoot></table>' +
    '<p class="sm-muted" style="margin:8px 2px 0">Satuan: hujan mm, debit m³/s, TMA cm (TMA opsional, diinput petugas). Baris Kabupaten: rata-rata untuk hujan dan skor, nilai tertinggi untuk debit dan TMA. Urut dari skor risiko tertinggi.</p>';
}

// ================= GRAFIK SVG =================
const nice = v => { const p = Math.pow(10, Math.floor(Math.log10(v))), f = v / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p; };
const hariSingkat = d => new Date(d + "T00:00:00").toLocaleDateString("id-ID", { weekday: "short" });

// batang: items [{d, v, k}] k = lalu | ini | depan
function svgBatang(items, opsi) {
  const W = EKSPOR ? 405 : 560, H = EKSPOR ? 190 : 240, L = 40, R = 8, T = EKSPOR ? 18 : 24, B = 42, n = items.length, tinggi = H - T - B;
  const mk = nice(Math.max(opsi.min || 1, Math.max.apply(null, items.map(i => i.v)) * 1.08));
  const bw = (W - L - R) / n, warna = { lalu: "#9fb3bd", ini: "#0b4a6f", depan: "#3b8fc4" };
  let s = '<svg class="gf" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="' + esc(opsi.label) + '">';
  [0, .5, 1].forEach(f => { const y = T + tinggi * (1 - f); s += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y + '" y2="' + y + '" stroke="#e1e8e6"/><text x="' + (L - 5) + '" y="' + (y + 4) + '" font-size="11" fill="#5d6f78" text-anchor="end">' + fmtN(mk * f, mk < 10 ? 1 : 0) + '</text>'; });
  if (opsi.garis && opsi.garis < mk) { const y = T + tinggi * (1 - opsi.garis / mk); s += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y + '" y2="' + y + '" stroke="#d92d27" stroke-dasharray="5 4"/><text x="' + (W - R) + '" y="' + (y - 4) + '" font-size="10.5" fill="#d92d27" text-anchor="end">' + esc(opsi.garisLabel) + '</text>'; }
  items.forEach((it, i) => {
    const x = L + i * bw + bw * .18, w = bw * .64, h = it.v / mk * tinggi, y = T + tinggi - h;
    s += '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + Math.max(h, 1) + '" rx="2" fill="' + warna[it.k] + '"/>' +
         '<text x="' + (x + w / 2) + '" y="' + (y - 5) + '" font-size="11" font-weight="700" fill="#14232b" text-anchor="middle">' + fmtN(it.v, opsi.dec || 0) + '</text>' +
         '<text x="' + (x + w / 2) + '" y="' + (H - 24) + '" font-size="10.5" font-weight="' + (it.k === "ini" ? 800 : 500) + '" fill="#14232b" text-anchor="middle">' + esc(hariSingkat(it.d)) + '</text>' +
         '<text x="' + (x + w / 2) + '" y="' + (H - 11) + '" font-size="10.5" fill="#5d6f78" text-anchor="middle">' + tglPendek(it.d) + '</text>';
  });
  return s + '</svg>';
}

function renderHujan() {
  const el = $("kHujan"), sel = kecAktif ? C(kecAktif) : null, hariIni = tglWITA(0);
  const judul = '<div class="kartu-kepala"><h2>Prakiraan Curah Hujan</h2><span class="petunjuk">' + (kecAktif ? esc(kecAktif) : "rata-rata 10 kecamatan") + " · mm/hari</span></div>";
  if (!SNAP || !adaKec().length) { el.innerHTML = judul + '<div class="kosong">' + esc(pesanData()) + '</div>'; return; }
  let seri;
  if (sel && sel.hujan) seri = sel.hujan.harian.map(x => ({ d: x.d, v: x.mm }));
  else { const per = {}; adaKec().forEach(k => (C(k).hujan ? C(k).hujan.harian : []).forEach(x => (per[x.d] = per[x.d] || []).push(x.mm))); seri = Object.keys(per).sort().map(d => ({ d: d, v: rataA(per[d]) })); }
  if (!seri.length) { el.innerHTML = judul + '<div class="kosong">Data hujan belum tersedia.</div>'; return; }
  seri.forEach(x => { x.k = x.d < hariIni ? "lalu" : x.d === hariIni ? "ini" : "depan"; });
  const mx = seri.reduce((m, x) => x.v > m.v ? x : m, seri[0]);
  el.innerHTML = judul + svgBatang(seri, { label: "Curah hujan harian", dec: 1, min: 20, garis: 50, garisLabel: "lebat 50 mm/hari" }) +
    '<div class="gf-legenda"><span><i style="background:#9fb3bd"></i>Beberapa hari lalu</span><span><i style="background:#0b4a6f"></i>Hari ini</span><span><i style="background:#3b8fc4"></i>Prakiraan</span></div>' +
    '<p class="catatan-kecil">Hari dengan hujan tertinggi: ' + esc(hariSingkat(mx.d)) + " " + tglPendek(mx.d) + " (" + fmtN(mx.v, 1) + " mm). Sumber: model Open-Meteo di titik tengah kecamatan; garis merah = batas hujan lebat BMKG per hari.</p>";
}

function renderJam() {
  const el = $("kJam"), sel = kecAktif ? C(kecAktif) : null;
  const judul = '<div class="jam-kepala"><b>Hujan Per Jam</b><span>' + (kecAktif ? esc(kecAktif) : "rata-rata 10 kecamatan") + ' · mm/jam</span></div>';
  const ada = adaKec().filter(k => C(k).hujan && C(k).hujan.jam && C(k).hujan.jam.length);
  if (!SNAP || !ada.length) { el.innerHTML = judul + '<div class="kosong">' + esc(SNAP ? "Data hujan per jam belum tersedia." : pesanData()) + '</div>'; return; }
  let seri;
  if (sel && sel.hujan && sel.hujan.jam) seri = sel.hujan.jam.slice();
  else { const n = Math.max.apply(null, ada.map(k => C(k).hujan.jam.length)); seri = []; for (let i = 0; i < n; i++) seri.push(rataA(ada.map(k => C(k).hujan.jam[i]))); }
  const iIni = Math.min(23, seri.length - 1), W = EKSPOR ? 470 : 820, H = EKSPOR ? 142 : 168, L = 32, R = 6, T = 22, B = 26, tinggi = H - T - B, bw = (W - L - R) / seri.length;
  const mk = nice(Math.max(5, Math.max.apply(null, seri) * 1.1));
  const mulai = new Date((sel ? sel.hujan.jamMulai : ada[0] && C(ada[0]).hujan.jamMulai) + ":00Z").getTime();
  let s = '<svg class="gf" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Hujan per jam, 24 jam terakhir dan 24 jam ke depan">';
  [0, .5, 1].forEach(f => { const y = T + tinggi * (1 - f); s += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y + '" y2="' + y + '" stroke="#d3dcda"/><text x="' + (L - 5) + '" y="' + (y + 4) + '" font-size="13" fill="#3d4f58" text-anchor="end">' + fmtN(mk * f, mk < 10 ? 1 : 0) + '</text>'; });
  seri.forEach((v, i) => {
    const h = (v || 0) / mk * tinggi, x = L + i * bw + 1, y = T + tinggi - h;
    s += '<rect x="' + x + '" y="' + y + '" width="' + Math.max(bw - 2, 1) + '" height="' + Math.max(h, v > 0 ? 1 : 0) + '" fill="' + (i < iIni ? "#7f98a5" : i === iIni ? "#0b4a6f" : "#1f78b8") + '"/>';
    if ((i % 6 === 0 && Math.abs(i - iIni) > 2) || i === iIni) { const jam = new Date(mulai + i * 36e5).toISOString().slice(11, 13); s += '<text x="' + (x + bw / 2) + '" y="' + (H - 7) + '" font-size="13" font-weight="600" fill="#14232b" text-anchor="middle">' + jam + '.00</text>'; }
  });
  const iMx = seri.reduce((m, v, q) => (v || 0) > (seri[m] || 0) ? q : m, 0);
  if ((seri[iMx] || 0) > 0) { const xm = Math.min(Math.max(L + iMx * bw + bw / 2, L + 14), W - 16), ym = T + tinggi - seri[iMx] / mk * tinggi - 4; s += '<text x="' + xm + '" y="' + Math.max(ym, T + 11) + '" font-size="13" font-weight="800" fill="#14232b" text-anchor="middle">' + fmtN(seri[iMx], 1) + '</text>'; }
  const xi = L + iIni * bw + bw / 2;
  s += '<line x1="' + xi + '" x2="' + xi + '" y1="' + T + '" y2="' + (T + tinggi) + '" stroke="#d97400" stroke-width="1.6" stroke-dasharray="4 3"/><text x="' + xi + '" y="' + (T - 6) + '" font-size="13" font-weight="800" fill="#d97400" text-anchor="middle">sekarang</text></svg>';
  const t24 = seri.slice(0, iIni + 1).reduce((a, b) => a + (b || 0), 0), d24 = seri.slice(iIni + 1).reduce((a, b) => a + (b || 0), 0);
  el.innerHTML = judul + s + '<div class="jam-kaki"><span><i style="background:#9fb3bd"></i>24 jam terakhir: ' + fmtN(t24, 1) + ' mm</span><span><i style="background:#3b8fc4"></i>24 jam ke depan: ' + fmtN(d24, 1) + ' mm</span><span class="jam-cat">Estimasi model Open-Meteo, bukan alat penakar hujan</span></div>';
}

function renderDebit() {
  const el = $("kDebit");
  const ks = adaKec().filter(k => C(k).debit && C(k).debit.seri && C(k).debit.seri.length);
  const kd = kecAktif && ks.indexOf(kecAktif) >= 0 ? kecAktif : (ks.length ? ks.reduce((m, k) => C(k).debit.max7 > C(m).debit.max7 ? k : m, ks[0]) : null);
  const judul = '<div class="kartu-kepala"><h2>Debit Sungai</h2><span class="petunjuk">' + (kd ? esc(kd) + (kecAktif ? "" : " (debit puncak tertinggi)") : "") + " · m³/s</span></div>";
  if (!SNAP || !kd) { el.innerHTML = judul + '<div class="kosong">' + esc(SNAP ? "Data debit belum tersedia." : pesanData()) + '</div>'; return; }
  const d = C(kd).debit, hariIni = tglWITA(0), seri = d.seri;
  const W = EKSPOR ? 405 : 560, H = EKSPOR ? 190 : 240, L = 44, R = 12, T = 26, B = 42, tinggi = H - T - B, mk = nice(Math.max(1, d.max7, Math.max.apply(null, seri.map(x => x.q))) * 1.1), n = seri.length;
  const X = i => L + (W - L - R) * (n === 1 ? .5 : i / (n - 1)), Y = v => T + tinggi * (1 - v / mk);
  const pts = seri.map((x, i) => X(i) + "," + Y(x.q)).join(" ");
  let s = '<svg class="gf" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Debit sungai harian">';
  [0, .5, 1].forEach(f => { const y = T + tinggi * (1 - f); s += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y + '" y2="' + y + '" stroke="#e1e8e6"/><text x="' + (L - 5) + '" y="' + (y + 4) + '" font-size="11" fill="#5d6f78" text-anchor="end">' + fmtN(mk * f, mk < 10 ? 1 : 0) + '</text>'; });
  s += '<polygon points="' + X(0) + "," + Y(0) + " " + pts + " " + X(n - 1) + "," + Y(0) + '" fill="rgba(59,143,196,.18)"/><polyline points="' + pts + '" fill="none" stroke="#0b4a6f" stroke-width="2.2"/>';
  const iIni = seri.findIndex(x => x.d === hariIni);
  if (iIni >= 0) s += '<line x1="' + X(iIni) + '" x2="' + X(iIni) + '" y1="' + T + '" y2="' + (T + tinggi) + '" stroke="#f08a00" stroke-dasharray="4 3"/><text x="' + X(iIni) + '" y="' + (T - 8) + '" font-size="11" font-weight="700" fill="#f08a00" text-anchor="middle">hari ini</text>';
  const iMk = seri.reduce((m, x, i) => x.q > seri[m].q ? i : m, 0);
  seri.forEach((x, i) => {
    s += '<circle cx="' + X(i) + '" cy="' + Y(x.q) + '" r="' + (i === iMk ? 4.5 : 2.6) + '" fill="' + (i === iMk ? "#d92d27" : "#0b4a6f") + '"/>';
    if (i % 2 === 0 || n < 9) s += '<text x="' + X(i) + '" y="' + (H - 24) + '" font-size="10.5" fill="#14232b" text-anchor="middle">' + esc(hariSingkat(x.d)) + '</text><text x="' + X(i) + '" y="' + (H - 11) + '" font-size="10.5" fill="#5d6f78" text-anchor="middle">' + tglPendek(x.d) + '</text>';
  });
  s += '<text x="' + X(iMk) + '" y="' + (Y(seri[iMk].q) - 9) + '" font-size="11.5" font-weight="800" fill="#d92d27" text-anchor="middle">' + fmtN(seri[iMk].q, 1) + '</text></svg>';
  el.innerHTML = judul + s +
    '<p class="catatan-kecil">Sekarang ' + fx(d.now, 1) + " m³/s; rata-rata 7 hari terakhir " + fx(d.base, 1) + "; puncak " + fx(d.max7, 1) + " m³/s" + (d.tglMax ? " pada " + tglPendek(d.tglMax) : "") +
    (d.rasio != null ? " (" + fx(d.rasio, 2) + "× rata-rata)" : "") + ". Debit adalah hasil simulasi model GloFAS (±5 km), bukan pengukuran alat di lapangan.</p>";
}

// ================= DETAIL KECAMATAN =================
// ================= SUMBER & KAKI =================
function renderSumber() {
  $("sumber").innerHTML = '<b>Sumber data dan cara membaca</b>' +
    '<p><b style="display:inline">Sumber:</b> prakiraan cuaca BMKG (semua kecamatan); curah hujan terkini, 24/72 jam terakhir, dan prakiraan dari Open-Meteo; debit sungai GloFAS (model); tinggi muka air (opsional) diinput petugas. Semua data direkam tiap jam di Google Sheet DESTANA sebagai riwayat.</p>' +
    '<p>Aplikasi ini alat bantu pemantauan, bukan pengganti peringatan resmi BPBD, BMKG, dan BWS.</p>';
  $("dibuka").textContent = new Date().toLocaleString("id-ID", { timeZone: "Asia/Makassar" }).replace(/\./g, ".").replace(",", "");
}

// ================= FORM PETUGAS (modal) =================
function formHTML(jenis) {
  let petugas = "", pin = "";
  try { petugas = localStorage.getItem("petugasBanjir") || ""; pin = sessionStorage.getItem("pinBanjir") || ""; } catch (_) {}
  const kec = '<label>Kecamatan<select name="kec" required>' + KEC.slice().sort((a, b) => a.localeCompare(b)).map(n => '<option' + (n === kecAktif ? " selected" : "") + '>' + esc(n) + '</option>').join("") + '</select></label>';
  const akhir = '<label>Nama petugas<input name="petugas" maxlength="60" autocomplete="name" value="' + esc(petugas) + '"></label>' +
    '<label>PIN input<input name="pin" type="password" inputmode="numeric" autocomplete="off" required value="' + esc(pin) + '"></label>';
  if (jenis === "tma")
    return '<form class="form-banjir" data-form="tma">' + kec +
      '<div class="baris2"><label>TMA (cm)<input name="cm" type="number" step="1" min="-100" max="3000" required inputmode="numeric"></label>' +
      '<label>Tren<select name="tren"><option value="naik">Naik</option><option value="tetap" selected>Tetap</option><option value="turun">Turun</option></select></label></div>' +
      '<label>Waktu bacaan WITA (kosongkan = sekarang)<input name="waktu" type="datetime-local"></label>' +
      '<label>Nama pos duga (opsional)<input name="pos" maxlength="80"></label>' +
      '<label>Catatan (opsional)<input name="catatan" maxlength="200"></label>' + akhir +
      '<button type="submit">Simpan pembacaan</button><p class="petunjuk">Waktu bacaan tidak boleh di masa depan atau lebih dari 7 hari lalu. Pembacaan lebih tua dari 48 jam tidak dihitung dalam analisis.</p></form>';
}
function bukaModal() {
  $("modalIsi").innerHTML = formHTML("tma");
  $("modal").hidden = false;
}
function tutupModal() { $("modal").hidden = true; }

// ================= UNDUH CSV =================
function unduh(nama, header, baris) {
  const q = v => '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"';
  const csv = "﻿" + [header.map(q).join(",")].concat(baris.map(r => r.map(q).join(","))).join("\r\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" })); a.download = nama;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
function unduhCSV(jenis) {
  if (jenis === "rekap") {
    const rows = REKAP && REKAP.baris;
    if (!rows || !rows.length) { toast("Belum ada data rekap untuk diunduh", "err"); return; }
    unduh("rekap-destana-hsu-" + rows[rows.length - 1].t + ".csv",
      ["Tanggal", "Kecamatan", "Hujan hari ini (mm)", "Skor risiko maks", "Status tertinggi", "TMA maks (cm)", "Debit maks (m3/s)", "Hujan 24 jam maks (mm)", "Jumlah rekaman"],
      rows.map(r => [r.t, r.kec, r.hujan, r.risiko, r.status, r.tma, r.debit, r.h24, r.n]));
    return;
  }
  if (!SNAP) { toast("Data belum dimuat", "err"); return; }
  unduh("kondisi-destana-hsu-" + SNAP.diperbarui.slice(0, 10) + ".csv",
    ["Kecamatan", "Status", "Skor risiko", "Hujan 1 jam (mm)", "Hujan 24 jam (mm)", "Hujan 72 jam (mm)", "Hujan hari ini (mm)", "Hujan 3 hari ke depan (mm)", "Hujan 7 hari ke depan (mm)", "TMA (cm)", "Status TMA", "Debit sekarang (m3/s)", "Debit puncak 7 hari (m3/s)"],
    adaKec().map(k => { const c = C(k), h = c.hujan || {}, d = c.debit || {}; return [k, c.skor.status, c.skor.risiko, h.jam1, h.jam24, h.jam72, h.ini, h.h3, h.h7, c.tma && c.tma.valid ? c.tma.cm : "", c.tma ? c.tma.status : "", d.now, d.max7]; }));
}

// ================= INTERAKSI =================
document.addEventListener("click", e => {
  const b = e.target.closest("[data-buka]"); if (b) { bukaModal(); return; }
  if (e.target.closest("[data-tutup]") || e.target === $("modal")) { tutupModal(); return; }
  const cs = e.target.closest("[data-csv]"); if (cs) { unduhCSV(cs.dataset.csv); return; }
  const kc = e.target.closest("[data-kec]"); if (kc) { pilihKecamatan(kc.dataset.kec); return; }
});
document.addEventListener("submit", e => { const f = e.target.closest("form[data-form]"); if (!f) return; e.preventDefault(); kirimForm(f); });
document.addEventListener("keydown", e => { if (e.key === "Escape") tutupModal(); });
// ----- unduh tampilan sebagai 2 gambar JPG potret (untuk dibagikan ke WhatsApp) -----
const jeda = ms => new Promise(r => setTimeout(r, ms));
async function tungguPeta(maksMs) {
  await jeda(500);
  const mulai = Date.now();
  while (ubin.isLoading() && Date.now() - mulai < maksMs) await jeda(150);
  await jeda(500);
}
function fotoHalaman(tinggi) {
  return html2canvas(document.body, {
    scale: 2, width: HAL_L, height: tinggi, windowWidth: 1280, windowHeight: tinggi,
    useCORS: true, backgroundColor: "#eef2f1", logging: false, scrollX: 0, scrollY: 0,
    onclone: doc => doc.querySelectorAll(".bar-aksi,.leaflet-control-zoom,#toast,#modal").forEach(e => { e.style.display = "none"; })
  }).then(cv => new Promise((ok, gagal) => cv.toBlob(b => b ? ok(b) : gagal(new Error("gambar kosong")), "image/jpeg", 0.92)));
}
function simpanBerkas(blob, nama) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = nama;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 8000);
}
async function unduhJPG() {
  const bt = $("btJpg"), body = document.body;
  if (EKSPOR) return;
  if (typeof html2canvas === "undefined") { toast("Pustaka gambar belum termuat. Periksa koneksi internet lalu muat ulang halaman.", "err"); return; }
  if (!SNAP) { toast("Data belum dimuat, tunggu sebentar", "err"); return; }
  const teks = bt.textContent, pilihan = kecAktif, posisi = window.scrollY;
  bt.disabled = true; bt.textContent = "Memproses…";
  try {
    tutupModal();
    EKSPOR = true; kecAktif = null;            // gambar selalu berisi ringkasan kabupaten
    body.classList.add("ekspor", "hal1");
    render(); window.scrollTo(0, 0);
    paskanPeta(false); aturLabel();
    await tungguPeta(8000);
    paskanPeta(false); aturLabel();
    await jeda(300);
    const gambar1 = await fotoHalaman(HAL_T[0]);
    body.classList.replace("hal1", "hal2");
    render();                                  // data bisa diperbarui saat menunggu
    await jeda(300);
    const gambar2 = await fotoHalaman(HAL_T[1]);
    const w = new Date(), p2 = n => String(n).padStart(2, "0");
    const nama = "DESTANA-HSU-" + tglWITA(0) + "-" + p2(w.getHours()) + p2(w.getMinutes());
    simpanBerkas(gambar1, nama + "-1.jpg");
    await jeda(800);
    simpanBerkas(gambar2, nama + "-2.jpg");
    toast("2 gambar JPG tersimpan. Bila hanya 1 yang muncul, izinkan unduhan ganda di browser.", "ok");
  } catch (err) {
    console.error(err); toast("Gagal membuat gambar: " + (err && err.message || "kesalahan tidak diketahui"), "err");
  } finally {
    EKSPOR = false; kecAktif = pilihan;
    body.classList.remove("ekspor", "hal1", "hal2");
    render(); paskanPeta(false); aturLabel(); window.scrollTo(0, posisi);
    bt.disabled = false; bt.textContent = teks;
  }
}
$("btJpg").addEventListener("click", unduhJPG);
$("btCetak").addEventListener("click", () => window.print());
window.addEventListener("beforeprint", () => { map.invalidateSize({ pan: false }); paskanPeta(false); });
window.addEventListener("afterprint", () => { map.invalidateSize({ pan: false }); paskanPeta(false); });
// tinggi peta mengikuti tinggi kartu kiri; sesuaikan ulang bila tinggi berubah
if (window.ResizeObserver) { let _ro; new ResizeObserver(() => { clearTimeout(_ro); _ro = setTimeout(() => { paskanPeta(false); aturLabel(); }, 150); }).observe(document.querySelector(".peta-badan")); }
let _rs; window.addEventListener("resize", () => { clearTimeout(_rs); _rs = setTimeout(() => { paskanPeta(false); aturLabel(); }, 200); });

// ================= MULAI =================
function logo(el, daftar) { el.innerHTML = (daftar || []).map(l => '<img src="' + esc(l.src) + '" alt="' + esc(l.alt || "") + '">').join(""); }
function tampilGalat(pesan) {
  const el = document.getElementById("banner");
  if (el) { el.className = "banner lv3"; el.innerHTML = '<span class="chip">GALAT</span><div><b>Tampilan gagal dimuat penuh</b><span class="k">' + esc(pesan) + '</span></div><div class="ket">Tekan Ctrl+F5 untuk memuat ulang tanpa cache. Bila tetap muncul, pastikan semua berkas (index.html, style.css, app.js, data-modul.js, batas-wilayah.js) sudah versi terbaru dan kirimkan pesan ini.</div>'; }
}
window.addEventListener("error", e => tampilGalat((e.message || "galat") + (e.lineno ? " (baris " + e.lineno + ")" : "")));
function langkah(fn) { try { fn(); } catch (err) { console.error(err); const b = $("banner"); b.className = "banner lv3"; b.innerHTML = "<b>Galat tampilan:</b> " + esc(err && err.message) + " <small>Perbarui semua berkas (index.html, style.css, app.js, data-modul.js, batas-wilayah.js) lalu muat ulang dengan Ctrl+F5.</small>"; } }
function init() {
  langkah(() => { logo($("logoKiri"), typeof LOGO_KIRI === "undefined" ? [] : LOGO_KIRI); logo($("logoKanan"), typeof LOGO_KANAN === "undefined" ? [] : LOGO_KANAN); });
  langkah(() => { if (SPREADSHEET_URL) { const a = $("btSheet"); a.href = SPREADSHEET_URL; a.hidden = false; } });
  langkah(render);
  langkah(bangunLabel); langkah(render); langkah(() => paskanPeta(false));
  setTimeout(() => langkah(() => { paskanPeta(false); aturLabel(); }), 300);
  langkah(iniData);
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
