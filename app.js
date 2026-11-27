/* ================================================================
 * DESTANA (Desa/Kelurahan Tanggap Bencana) HSU — tampilan dashboard satu halaman
 * Data: SNAP (snapshot) dan REKAP (rekap harian) dari data-modul.js; peta Leaflet; grafik SVG tanpa pustaka tambahan.
 * ================================================================ */

const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
const $ = id => document.getElementById(id);
const IKON_TETES = '<svg viewBox="0 0 24 24"><path d="M12 2.5c3.6 4.2 6 7.4 6 10.6A6 6 0 0 1 6 13.1c0-3.200 2.400-6.400 6-10.600z"/></svg>';

let kecAktif = null;      // kecamatan yang dipilih (null = ringkasan kabupaten)

function toast(teks, jenis) {
  const el = $("toast"); el.textContent = teks;
  el.className = "toast tampil " + (jenis === "err" ? "err" : "ok");
  clearTimeout(toast._t); toast._t = setTimeout(() => el.classList.remove("tampil"), jenis === "err" ? 6500 : 3500);
}

const C = k => (SNAP && SNAP.kec) ? SNAP.kec[k] || null : null;
const adaKec = () => KEC.filter(k => C(k));

// ================= PETA =================
const map = L.map("map", { zoomControl: false, preferCanvas: true, zoomSnap: 0.25, scrollWheelZoom: false, dragging: !L.Browser.mobile }).setView([-2.42, 115.2], 10);
L.control.zoom({ position: "bottomleft" }).addTo(map);
map.on("click", () => map.scrollWheelZoom.enable());
map.on("mouseout", () => map.scrollWheelZoom.disable());
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "&copy; OpenStreetMap contributors", maxZoom: 19 }).addTo(map);

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
  const w = map.getSize().x, pad = w > 1000 ? 320 : 12;
  return { paddingTopLeft: [pad, 14], paddingBottomRight: [pad, 14], maxZoom: 13, animate: false };
}
function paskanPeta(animasi) {
  map.invalidateSize({ pan: false });
  const o = opsiPandang(); o.animate = !!animasi;
  map.fitBounds(kecAktif ? poligonKec[kecAktif].getBounds() : batasKab.getBounds(), o);
}

function pilihKecamatan(n) {
  kecAktif = (kecAktif === n || !n) ? null : n;
  render(); paskanPeta(true);
}

// ================= RENDER =================
function render() {
  renderKop(); renderBanner(); renderKPI(); renderIndikator(); renderOverlay(); renderPetaUpdate();
  renderTabel(); renderTren(); renderDetail(); renderHujan(); renderDebit(); renderSumber();
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
    (nTma < ks.length ? " Kecamatan tanpa TMA terukur dinilai maksimal Waspada (perkiraan model)." : "") + '</div>';
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
  const hIni = maks(c => c.hujan && c.hujan.ini), h3 = maks(c => c.hujan && c.hujan.h3);
  const tma = maks(c => c.tma && c.tma.valid ? c.tma.cm : null), deb = maks(c => c.debit && c.debit.max7);
  const nTma = ks.filter(k => C(k).tma && C(k).tma.valid).length;
  const rIni = SNAP ? rataA(ks.map(k => C(k).hujan && C(k).hujan.ini)) : null, r3 = SNAP ? rataA(ks.map(k => C(k).hujan && C(k).hujan.h3)) : null;
  const kd = deb ? C(deb.k).debit : null, kes = SNAP ? SNAP.ringkas : null;
  const kartu = (lb, nilai, sat, sm) => '<div class="ind"><div class="lb">' + lb + '</div><div class="nilai">' + nilai + (sat ? "<small>" + sat + "</small>" : "") + '</div><div class="sm">' + sm + '</div></div>';
  $("indikator").innerHTML =
    kartu("Hujan hari ini", fx(rIni, 1), "mm", hIni ? "rata-rata · tertinggi " + esc(hIni.k) + " " + fx(hIni.v, 1) + " mm" : "rata-rata kabupaten") +
    kartu("Hujan 3 hari ke depan", fx(r3, 1), "mm", h3 ? "rata-rata · tertinggi " + esc(h3.k) + " " + fx(h3.v, 1) + " mm" : "rata-rata kabupaten") +
    kartu("Tinggi muka air", tma ? fx(tma.v, 0) : "—", tma ? "cm" : "", tma ? "tertinggi · " + esc(tma.k) : (SNAP ? "belum ada pembacaan ≤ 48 jam" : "menunggu data")) +
    kartu("Debit puncak 7 hari", deb ? fx(deb.v, 1) : "—", deb ? "m³/s" : "", deb ? esc(deb.k) + " · " + (kd && kd.rasio != null ? fx(kd.rasio, 2) + "× rata-rata" : "model GloFAS") : "menunggu data") +
    kartu("Kesiapan sumber daya", kes && kes.rataKesiapan != null ? kes.rataKesiapan : "—", kes && kes.rataKesiapan != null ? "%" : "", kes ? kes.kesiapanTerisi + " dari " + ks.length + " kecamatan sudah input" : "menunggu data");
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
      '<small>' + (sel ? "desa wakil: " + esc(sel.cuaca.desa || "-") : (hujan ? hujan + " dari " + dari.length + " kecamatan diprakirakan hujan" : "tidak ada hujan diprakirakan")) + '</small></span></div>' +
      '<div class="cuaca-baris"><span><b>' + fx(hu, 0) + '%</b>kelembapan</span><span><b>' + fx(ws, 1) + '</b>km/jam angin</span><span><b>' +
      (sel ? fx(sel.hujan && sel.hujan.ini, 1) : fx(rataA(ks.map(k => C(k).hujan && C(k).hujan.ini)), 1)) + '</b>mm hujan hari ini</span></div></div>';
  }
  $("ovCuaca").innerHTML = '<div class="ov-judul">Cuaca · ' + (kecAktif ? esc(kecAktif) : "Kabupaten HSU") + '<small>BMKG</small></div>' + cuaca;

  // --- rekomendasi ---
  let li = "";
  if (!SNAP) li = '<li>' + esc(pesanData()) + '</li>';
  else if (sel) { const lv = LV[sel.skor.status]; li = sel.rekom.slice(0, 5).map((r, i) => '<li' + (i === 0 ? ' class="lv' + lv + '"' : "") + '>' + esc(r) + '</li>').join(""); }
  else {
    const urut = ks.slice().sort((a, b) => C(b).skor.risiko - C(a).skor.risiko).filter(k => C(k).skor.status !== "Normal");
    li = urut.length ? urut.slice(0, 4).map(k => '<li class="lv' + LV[C(k).skor.status] + '"><b>' + esc(k) + " (" + C(k).skor.status + "):</b> " +
        esc(C(k).rekom.filter(x => !/^Belum ada pembacaan|^Data kesiapan|^Status ini hanya/.test(x))[0] || "") + '</li>').join("")
      : '<li class="lv0">Seluruh kecamatan berstatus Normal. Lanjutkan pemantauan rutin dan perbarui data TMA serta kesiapan sumber daya.</li>';
    li += '<li>Pilih satu kecamatan untuk melihat daftar tindakan lengkapnya.</li>';
  }
  $("ovRekom").innerHTML = '<div class="ov-judul">Informasi &amp; Rekomendasi<small>' + (kecAktif ? esc(kecAktif) : "kabupaten") + '</small></div><div class="ov-isi"><ul class="rekom-daftar">' + li + '</ul></div>';

  // --- teratas ---
  const top = ks.slice().sort((a, b) => C(b).skor.risiko - C(a).skor.risiko).slice(0, 5);
  $("ovTeratas").innerHTML = '<div class="ov-judul">Skor Risiko Tertinggi<small>0–100</small></div><div class="ov-isi">' +
    (top.length ? top.map((k, i) => '<div class="top-baris" data-kec="' + esc(k) + '"><span class="no">' + (i + 1) + '</span><span class="nm">' + esc(k) + '</span>' +
      '<span class="bar"><i style="width:' + C(k).skor.risiko + '%;background:' + WARNA_LV[LV[C(k).skor.status]] + '"></i></span><span class="sk">' + C(k).skor.risiko + '</span></div>').join("")
      : '<span style="color:#5d6f78">Data belum tersedia.</span>') + '</div>';
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
      '<td>' + fx(h.ini, 1) + '</td><td>' + fx(h.h3, 1) + '</td>' +
      '<td>' + (c.tma && c.tma.valid ? fx(c.tma.cm, 0) + '<span class="sm-muted">' + esc(c.tma.status) + '</span>' : '—<span class="sm-muted">belum ada</span>') + '</td>' +
      '<td>' + fx(d.now, 1) + '<span class="sm-muted">puncak ' + fx(d.max7, 1) + '</span></td>' +
      '<td><div class="skor-sel"><b>' + c.skor.risiko + '</b><span class="mini"><i style="width:' + c.skor.risiko + '%;background:' + WARNA_LV[lv] + '"></i></span></div></td>' +
      '<td><span class="lencana lv' + lv + '">' + esc(c.skor.status) + '</span></td>' +
      '<td>' + (c.kes ? c.kes.pct + "%" : "—") + '</td></tr>';
  }).join("");
  const r = SNAP.ringkas, mx = f => { const v = ks.map(k => f(C(k))).filter(x => x != null && !isNaN(x)); return v.length ? Math.max.apply(null, v) : null; };
  el.innerHTML = '<table class="tb"><thead><tr><th class="t">Kecamatan</th><th class="t">Cuaca (BMKG)</th><th>Hujan hari ini</th><th>Hujan 3 hari</th><th>TMA</th><th>Debit</th><th>Skor</th><th>Status</th><th>Kesiapan</th></tr></thead><tbody>' + baris +
    '</tbody><tfoot><tr><td>Kabupaten</td><td class="t"></td><td>' + fx(rataA(ks.map(k => C(k).hujan && C(k).hujan.ini)), 1) + '</td><td>' + fx(rataA(ks.map(k => C(k).hujan && C(k).hujan.h3)), 1) + '</td>' +
    '<td>' + fx(mx(c => c.tma && c.tma.valid ? c.tma.cm : null), 0) + '</td><td>' + fx(mx(c => c.debit && c.debit.now), 1) + '</td><td>' + r.rataSkor + '</td><td><span class="lencana lv' + LV[r.tertinggi] + '">' + esc(r.tertinggi) + '</span></td><td>' +
    (r.rataKesiapan != null ? r.rataKesiapan + "%" : "—") + '</td></tr></tfoot></table>' +
    '<p class="sm-muted" style="margin:8px 2px 0">Satuan: hujan mm, TMA cm, debit m³/s. Baris Kabupaten: rata-rata untuk hujan, skor, dan kesiapan; nilai tertinggi untuk TMA dan debit. Urut dari skor risiko tertinggi.</p>';
}

// ================= GRAFIK SVG =================
const nice = v => { const p = Math.pow(10, Math.floor(Math.log10(v))), f = v / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p; };
const hariSingkat = d => new Date(d + "T00:00:00").toLocaleDateString("id-ID", { weekday: "short" });

function renderTren() {
  const el = $("tren");
  if (!REKAP || !REKAP.baris.length) { el.innerHTML = '<div class="kosong">' + (API_BANJIR ? "Belum ada rekap harian. Data terkumpul otomatis tiap 3 jam." : esc(pesanData())) + '</div>'; return; }
  const hari = []; for (let o = 6; o >= 0; o--) hari.push(tglWITA(o));
  const per = hari.map(t => { const h = [0, 0, 0, 0], rows = REKAP.baris.filter(r => r.t === t); rows.forEach(r => { if (LV[r.status] != null) h[LV[r.status]]++; }); return { t: t, h: h, n: rows.length }; });
  const W = 520, H = 250, L = 28, R = 8, T = 24, B = 44, bw = (W - L - R) / 7, tinggi = H - T - B, mk = Math.max(KEC.length, 1);
  let s = '<svg class="gf" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Jumlah kecamatan per tingkat siaga, 7 hari terakhir">';
  [0, .5, 1].forEach(f => { const y = T + tinggi * (1 - f); s += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y + '" y2="' + y + '" stroke="#e1e8e6"/><text x="' + (L - 5) + '" y="' + (y + 4) + '" font-size="11" fill="#5d6f78" text-anchor="end">' + fmtN(mk * f, 0) + '</text>'; });
  per.forEach((p, i) => {
    const x = L + i * bw + bw * .2, w = bw * .6; let y = T + tinggi;
    if (!p.n) s += '<rect x="' + x + '" y="' + (y - 3) + '" width="' + w + '" height="3" rx="1.5" fill="#dde4e2"/><text x="' + (x + w / 2) + '" y="' + (y - 8) + '" font-size="12" font-weight="700" fill="#8a9aa1" text-anchor="middle">–</text>';
    else {
      [0, 1, 2, 3].forEach(lv => { const hh = p.h[lv] / mk * tinggi; if (hh > 0) { y -= hh; s += '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + hh + '" fill="' + WARNA_LV[lv] + '"/>'; } });
      s += '<text x="' + (x + w / 2) + '" y="' + (y - 6) + '" font-size="12" font-weight="800" fill="#14232b" text-anchor="middle">' + (p.h[1] + p.h[2] + p.h[3]) + '</text>';
    }
    s += '<text x="' + (x + w / 2) + '" y="' + (H - 24) + '" font-size="11.5" font-weight="700" fill="#14232b" text-anchor="middle">' + esc(hariSingkat(p.t)) + '</text>' +
         '<text x="' + (x + w / 2) + '" y="' + (H - 10) + '" font-size="11" fill="#5d6f78" text-anchor="middle">' + tglPendek(p.t) + '</text>';
  });
  s += '</svg><div class="gf-legenda">' + [0, 1, 2, 3].map(lv => '<span><i style="background:' + WARNA_LV[lv] + '"></i>' + NAMA_LV[lv] + '</span>').join("") + '</div>' +
       '<p class="catatan-kecil">Angka di atas batang = jumlah kecamatan berstatus Waspada, Siaga, atau Awas pada hari itu (status tertinggi harian dari rekap spreadsheet).</p>';
  el.innerHTML = s;
}

// batang: items [{d, v, k}] k = lalu | ini | depan
function svgBatang(items, opsi) {
  const W = 560, H = 240, L = 40, R = 8, T = 24, B = 42, n = items.length, tinggi = H - T - B;
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

function renderDebit() {
  const el = $("kDebit");
  const ks = adaKec().filter(k => C(k).debit && C(k).debit.seri && C(k).debit.seri.length);
  const kd = kecAktif && ks.indexOf(kecAktif) >= 0 ? kecAktif : (ks.length ? ks.reduce((m, k) => C(k).debit.max7 > C(m).debit.max7 ? k : m, ks[0]) : null);
  const judul = '<div class="kartu-kepala"><h2>Debit Sungai</h2><span class="petunjuk">' + (kd ? esc(kd) + (kecAktif ? "" : " (debit puncak tertinggi)") : "") + " · m³/s</span></div>";
  if (!SNAP || !kd) { el.innerHTML = judul + '<div class="kosong">' + esc(SNAP ? "Data debit belum tersedia." : pesanData()) + '</div>'; return; }
  const d = C(kd).debit, hariIni = tglWITA(0), seri = d.seri;
  const W = 560, H = 240, L = 44, R = 12, T = 26, B = 42, tinggi = H - T - B, mk = nice(Math.max(1, d.max7, Math.max.apply(null, seri.map(x => x.q))) * 1.1), n = seri.length;
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
function renderDetail() {
  const el = $("detail");
  if (!SNAP || !adaKec().length) { el.innerHTML = '<div class="kartu-kepala"><h2>Detail Kecamatan</h2></div><div class="kosong">' + esc(pesanData()) + '</div>'; return; }
  const ks = adaKec(), top = ks.slice().sort((a, b) => C(b).skor.risiko - C(a).skor.risiko)[0];
  const k = kecAktif || top, c = C(k), lv = LV[c.skor.status], i = KEC.indexOf(k), sk = c.skor, h = c.hujan, d = c.debit, a = c.ambang;
  const fb = (lb, v, ket) => '<div class="fb"><span>' + lb + '</span><span class="t"><i style="width:' + (v == null ? 0 : v) + '%;background:' + warnaSkor(v) + '"></i></span><b>' + (v == null ? "—" : v) + '</b>' + (ket ? '<div class="fb-ket">' + ket + '</div>' : "") + '</div>';
  const nv = (lb, v, s) => '<div class="nv"><div class="lb">' + lb + '</div><div class="v">' + v + '</div><div class="s">' + s + '</div></div>';
  const kes = c.kes, bk = (nm, f) => { const t = kes.target[f], p = t > 0 ? Math.min(1, kes[f] / t) : 1; return '<div class="kes-baris"><span>' + nm + '</span><span class="t"><i style="width:' + Math.round(p * 100) + '%;background:' + (p >= .8 ? WARNA_LV[0] : p >= .5 ? WARNA_LV[1] : WARNA_LV[3]) + '"></i></span><span>' + fmtN(kes[f]) + " / " + fmtN(t) + '</span></div>'; };
  el.innerHTML =
    '<div class="detail-kepala"><h2>Detail Kecamatan</h2><select id="selKec" aria-label="Pilih kecamatan">' +
      KEC.slice().sort((x, y) => x.localeCompare(y)).map(n => '<option' + (n === k ? " selected" : "") + (C(n) ? "" : " disabled") + '>' + esc(n) + '</option>').join("") + '</select>' +
      (kecAktif ? "" : '<span class="petunjuk" style="font-size:12px;color:#5d6f78">menampilkan kecamatan dengan skor tertinggi</span>') +
      '<span class="skor-besar"><span class="lencana lv' + lv + '">' + esc(sk.status) + '</span><b>' + sk.risiko + '</b><span style="color:#5d6f78">/ 100</span></span></div>' +
    '<div class="detail-grid">' +
      '<div><h3>Faktor risiko</h3>' +
        fb("Tinggi muka air", sk.tma, sk.tma == null ? "belum ada pembacaan ≤ 48 jam, tidak dihitung" : "") +
        fb("Curah hujan", sk.hujan, sk.hujan == null ? "tanpa data" : "") + fb("Debit sungai", sk.debit, sk.debit == null ? "tanpa data atau debit puncak terlalu kecil" : "") +
        fb("Keterpaparan penduduk", sk.paparan, fmtN(c.kepadatan) + " jiwa/km² · " + fmtN(POP[i]) + " jiwa · " + DESA[i] + " desa/kelurahan") +
        '<div class="nilai-grid">' +
          nv("Tinggi muka air", c.tma ? fmtN(c.tma.cm) + " cm" : "—", c.tma ? esc(c.tma.status) + " · " + esc(c.tma.tren) + " · " + umurTeks(c.tma.umurJam) + (c.tma.valid ? "" : " (kedaluwarsa)") : "belum ada pembacaan") +
          nv("Ambang (cm)", a.waspada + " / " + a.siaga + " / " + a.awas, "Waspada / Siaga / Awas · " + esc(a.pos)) +
          nv("Hujan 3 hari ke depan", fx(h && h.h3, 1) + " mm", h ? "hari ini " + fx(h.ini, 1) + " · 3 hari lalu " + fx(h.lalu3, 1) + " · 7 hari " + fx(h.h7, 1) : "") +
          nv("Debit sungai", fx(d && d.now, 1) + " m³/s", d ? "puncak " + fx(d.max7, 1) + (d.rasio != null ? " · " + fx(d.rasio, 2) + "× rata-rata" : "") : "") +
        '</div></div>' +
      '<div><h3>Kesiapan sumber daya</h3>' + (kes
        ? '<div class="kes-besar"><b>' + kes.pct + '%</b><span style="color:#5d6f78">dari target · pembaruan ' + esc(kes.waktu) + '</span></div>' +
          bk("Perahu", "perahu") + bk("Posko", "posko") + bk("Relawan", "relawan") + bk("Pompa", "pompa") + bk("Logistik (hari)", "logistik")
        : '<div class="kosong">Data kesiapan belum diinput.<br><button type="button" class="btn utama" style="margin-top:10px" data-buka="kesiapan">Input kesiapan</button></div>') + '</div>' +
      '<div><h3>Tindakan yang disarankan</h3><ul class="rekom-penuh">' + c.rekom.map((r, j) => '<li' + (j === 0 ? ' class="lv' + lv + '"' : "") + '>' + esc(r) + '</li>').join("") + '</ul></div>' +
    '</div>';
}

// ================= SUMBER & KAKI =================
function renderSumber() {
  $("sumber").innerHTML = '<b>Sumber data dan cara membaca</b>' +
    '<p><b style="display:inline">Sumber:</b> prakiraan cuaca BMKG; curah hujan Open-Meteo; debit sungai GloFAS (Open-Meteo Flood API); tinggi muka air dan kesiapan sumber daya diinput petugas dan tersimpan di spreadsheet DESTANA.</p>' +
    '<p>Skor risiko 0–100 dihitung dari curah hujan (30%), tinggi muka air (35%), dan debit (25%), diperbesar hingga +25% oleh kepadatan penduduk. Tingkat: Normal &lt; 25, Waspada 25–49, Siaga 50–74, Awas ≥ 75. Tanpa TMA terukur (≤ 48 jam) status dibatasi maksimal Waspada. Debit adalah hasil model, bukan alat ukur. Ambang TMA dan target kesiapan mengikuti sheet "Ambang &amp; Target".</p>' +
    '<p>Aplikasi ini alat bantu pemantauan, bukan pengganti peringatan resmi BPBD, BMKG, dan BWS.</p>';
  $("dibuka").textContent = new Date().toLocaleString("id-ID", { timeZone: "Asia/Makassar" }).replace(/\./g, ".").replace(",", "");
}

// ================= FORM PETUGAS (modal) =================
function formHTML(jenis) {
  let petugas = "", pin = "";
  try { petugas = localStorage.getItem("petugasBanjir") || ""; pin = sessionStorage.getItem("pinBanjir") || ""; } catch (_) {}
  const c = kecAktif ? C(kecAktif) : null, k = c && c.kes;
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
  const v = f => k ? ' value="' + esc(k[f]) + '"' : "";
  const num = (nama, label) => '<label>' + label + '<input name="' + nama + '" type="number" min="0" max="100000" step="1" required inputmode="numeric"' + v(nama) + '></label>';
  return '<form class="form-banjir" data-form="kesiapan">' + kec +
    '<div class="baris2">' + num("perahu", "Perahu (unit)") + num("posko", "Posko (unit)") + '</div>' +
    '<div class="baris2">' + num("relawan", "Relawan (orang)") + num("pompa", "Pompa (unit)") + '</div>' +
    num("logistik", "Logistik cukup untuk (hari)") + akhir +
    '<button type="submit">Simpan kesiapan</button><p class="petunjuk">Isi jumlah yang tersedia dan siap dipakai saat ini. Data terbaru menggantikan data sebelumnya dalam analisis; semua riwayat tetap tersimpan.</p></form>';
}
function bukaModal(jenis) {
  jenis = jenis || "tma";
  document.querySelectorAll(".tab button").forEach(b => b.classList.toggle("aktif", b.dataset.tab === jenis));
  $("modalIsi").innerHTML = formHTML(jenis);
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
      ["Tanggal", "Kecamatan", "Hujan hari ini (mm)", "Skor risiko maks", "Status tertinggi", "TMA maks (cm)", "Debit maks (m3/s)", "Kesiapan (%)", "Jumlah rekaman"],
      rows.map(r => [r.t, r.kec, r.hujan, r.risiko, r.status, r.tma, r.debit, r.kes, r.n]));
    return;
  }
  if (!SNAP) { toast("Data belum dimuat", "err"); return; }
  unduh("kondisi-destana-hsu-" + SNAP.diperbarui.slice(0, 10) + ".csv",
    ["Kecamatan", "Status", "Skor risiko", "Hujan hari ini (mm)", "Hujan 3 hari ke depan (mm)", "Hujan 7 hari ke depan (mm)", "TMA (cm)", "Status TMA", "Debit sekarang (m3/s)", "Debit puncak 7 hari (m3/s)", "Kesiapan (%)"],
    adaKec().map(k => { const c = C(k), h = c.hujan || {}, d = c.debit || {}; return [k, c.skor.status, c.skor.risiko, h.ini, h.h3, h.h7, c.tma && c.tma.valid ? c.tma.cm : "", c.tma ? c.tma.status : "", d.now, d.max7, c.kes ? c.kes.pct : ""]; }));
}

// ================= INTERAKSI =================
document.addEventListener("click", e => {
  const b = e.target.closest("[data-buka]"); if (b) { bukaModal(b.dataset.buka === "kesiapan" ? "kesiapan" : "tma"); return; }
  if (e.target.closest("[data-tutup]") || e.target === $("modal")) { tutupModal(); return; }
  const tb = e.target.closest("[data-tab]"); if (tb) { bukaModal(tb.dataset.tab); return; }
  const cs = e.target.closest("[data-csv]"); if (cs) { unduhCSV(cs.dataset.csv); return; }
  const kc = e.target.closest("[data-kec]"); if (kc) { pilihKecamatan(kc.dataset.kec); return; }
});
document.addEventListener("change", e => { if (e.target.id === "selKec") { kecAktif = null; pilihKecamatan(e.target.value); } });
document.addEventListener("submit", e => { const f = e.target.closest("form[data-form]"); if (!f) return; e.preventDefault(); kirimForm(f); });
document.addEventListener("keydown", e => { if (e.key === "Escape") tutupModal(); });
$("btSegarkan").addEventListener("click", () => { muatSnapshot(); muatRekap(); toast("Memuat ulang data…", "ok"); });
$("btCetak").addEventListener("click", () => window.print());
window.addEventListener("beforeprint", () => { map.invalidateSize({ pan: false }); paskanPeta(false); });
window.addEventListener("afterprint", () => { map.invalidateSize({ pan: false }); paskanPeta(false); });
let _rs; window.addEventListener("resize", () => { clearTimeout(_rs); _rs = setTimeout(() => { paskanPeta(false); aturLabel(); }, 200); });

// ================= MULAI =================
function logo(el, daftar) { el.innerHTML = (daftar || []).map(l => '<img src="' + esc(l.src) + '" alt="' + esc(l.alt || "") + '">').join(""); }
function init() {
  logo($("logoKiri"), LOGO_KIRI); logo($("logoKanan"), LOGO_KANAN);
  if (SPREADSHEET_URL) { const a = $("btSheet"); a.href = SPREADSHEET_URL; a.hidden = false; }
  bangunLabel(); render(); paskanPeta(false);
  setTimeout(() => { paskanPeta(false); aturLabel(); }, 300);
  iniData();
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
