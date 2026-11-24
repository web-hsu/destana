
/* ================================================================
 * DESTANA (Desa/Kelurahan Tanggap Bencana) HSU - KERANGKA TAMPILAN
 * Struktur: Header (menu bidang) | Panel kiri | Peta | Panel kanan | Dock
 * Menu & modul didefinisikan di BIDANG (data-modul.js); data dinamis datang dari Apps Script (Kode.gs).
 * ================================================================ */

const esc = s => String(s).replace(/[&<>"']/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
const ikon = id => '<svg class="ic"><use href="#' + id + '"/></svg>';
const $ = id => document.getElementById(id);
const TINGKAT = Object.keys(LV);   // Normal, Waspada, Siaga, Awas

// Modul DATA berupa fungsi yang dievaluasi saat digambar, supaya selalu memakai data & kecamatan terpilih terbaru.
function ambilData(id, i) {
  const r = (DATA[id] || [])[i];
  try { return typeof r === "function" ? r() : r; } catch (e) { console.warn("Modul gagal disusun:", id, i, e); return null; }
}

function toast(teks, jenis) {
  const el = $("toast"); el.textContent = teks;
  el.className = "toast tampil " + (jenis === "err" ? "lv3" : "lv0");
  clearTimeout(toast._t); toast._t = setTimeout(() => el.classList.remove("tampil"), jenis === "err" ? 6500 : 3500);
}

// ---------- Peta ----------
// Tombol zoom (+/−) sengaja tidak dipasang; zoom lewat scroll mouse atau cubit layar.
const map = L.map("map", { zoomControl: false, preferCanvas: true, zoomSnap: 0.25 }).setView([-2.39, 115.27], 10);

const PETA_DASAR = {
  standar: L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    { attribution: "&copy; OpenStreetMap contributors", maxZoom: 19 }),
  satelit: L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    { attribution: "Tiles &copy; Esri", maxZoom: 19 })
};
let dasarAktif = "standar";
PETA_DASAR.standar.addTo(map);

// ---------- Batas wilayah ----------
// Semua garis batas tertutup, jadi dijadikan poligon agar bisa diisi & diklik.
const cincin = f => f.geometry.coordinates.map(c => [c[1], c[0]]);
const fitur = lv => BATAS_HSU_GEOJSON.features.filter(f => f.properties && f.properties.level === lv);

const lapKabupaten = L.layerGroup();
fitur("kabupaten").forEach(f => {
  L.polygon(cincin(f), { color: "#000", weight: 2, opacity: 1, fill: false, interactive: false }).addTo(lapKabupaten);
});
lapKabupaten.addTo(map);
const batasKabupaten = L.polygon(cincin(fitur("kabupaten")[0]), { stroke: false, fill: false, interactive: false });

const lapKecamatan = L.layerGroup();
const poligonKec = {};
const GAYA_KEC = { color: "#0a2a7a", weight: 1.5, opacity: 1, dashArray: "6 4", fillColor: "#27d3ff", fillOpacity: 0 };
fitur("kecamatan").forEach(f => {
  const p = L.polygon(cincin(f), GAYA_KEC).addTo(lapKecamatan);
  poligonKec[f.properties.name] = p;
  p.on("mouseover", () => { if (kecAktif !== f.properties.name) p.setStyle({ fillOpacity: warnaKec[f.properties.name] ? .75 : .18 }); });
  p.on("mouseout", () => { if (kecAktif !== f.properties.name) p.setStyle({ fillOpacity: warnaKec[f.properties.name] ? .55 : 0 }); });
  p.on("click", () => pilihKecamatan(f.properties.name));
});
lapKecamatan.addTo(map);

// Area peta yang benar-benar kosong = layar dikurangi header, panel kiri/kanan, dock, dan legenda.
// Diukur langsung dari elemen di layar, sehingga peta selalu tepat di tengah area kosong itu.
function areaPeta() {
  const W = window.innerWidth, H = window.innerHeight, G = 16;
  const sempit = W <= 820, tutup = document.body.classList.contains("panel-tutup");
  const r = el => el.getBoundingClientRect();
  const atas = r(document.querySelector(".topbar")).bottom + G;
  let bawah = r(document.querySelector(".dock")).top;
  let kiri = 20, kanan = 20;
  if (!sempit && !tutup) {
    const pw = parseFloat(getComputedStyle(document.body).getPropertyValue("--pw")) || 340;
    kiri = kanan = 14 + pw + G;   // jarak panel ke tepi (14px) + lebar panel + celah
  }
  if (sempit && !tutup) bawah = Math.min(bawah, r($("panelKiri")).top);
  // Ruang untuk legenda modul SELALU disisihkan di desktop (tinggi tetap), baik legenda tampil maupun tidak,
  // sehingga letak peta sama persis di semua menu, modul berdata maupun belum.
  if (!sempit) bawah -= 120;
  return { tl: [Math.round(kiri), Math.round(atas)], br: [Math.round(kanan), Math.round(Math.max(H - bawah + G, 20))] };
}
function opsiPandang(extra) {
  const a = areaPeta();
  return Object.assign({ paddingTopLeft: a.tl, paddingBottomRight: a.br, maxZoom: 13 }, extra);
}

function paskanKabupaten(animasi) {
  map.invalidateSize({ pan: false });
  map.fitBounds(batasKabupaten.getBounds(), opsiPandang({ animate: !!animasi }));
}
function paskanKecamatan(nama, animasi) {
  map.invalidateSize({ pan: false });
  const b = poligonKec[nama].getBounds();
  if (animasi) map.flyToBounds(b, opsiPandang({ duration: .8 }));
  else map.fitBounds(b, opsiPandang({ animate: false }));
}
// Pulihkan pandangan: kecamatan terpilih jika ada, selain itu seluruh kabupaten.
function sesuaikanPandangan(animasi) {
  if (kecAktif) paskanKecamatan(kecAktif, animasi); else paskanKabupaten(animasi);
}

// ---------- Label kecamatan (diatur otomatis agar tidak saling menimpa) ----------
const labelKecamatan = [];

// Murni hitungan: items = [{x,y,w,h}] (piksel layar) -> offset [{dx,dy}] tanpa tumpang tindih.
function susunLabel(items) {
  const GAP = 3, terpasang = [], hasil = [];
  const tabrak = (a, b) =>
    Math.abs(a.x - b.x) < (a.w + b.w) / 2 + GAP && Math.abs(a.y - b.y) < (a.h + b.h) / 2 + GAP;
  items.forEach(it => {
    const h = it.h + GAP;
    // Coba geser sedikit ke segala arah; ambil yang paling dekat dengan posisi asal.
    const kandidat = [[0, 0]];
    for (let r = 1; r <= 4; r++) {
      [-1, 0, 1].forEach(iy => [-2, -1, 0, 1, 2].forEach(ix => {
        if (iy === 0 && ix === 0) return;
        kandidat.push([ix * r * 22, iy * r * h]);
      }));
    }
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

function aturLabelKecamatan() {
  if (!labelKecamatan.length) return;
  const font = window.innerWidth <= 820 ? 11 : 13;
  const ctx = document.createElement("canvas").getContext("2d");
  ctx.font = "700 " + font + "px Rajdhani, Arial";
  const items = labelKecamatan.map(l => {
    const p = map.latLngToContainerPoint([l.lat, l.lon]);
    return { x: p.x, y: p.y, w: ctx.measureText(l.name).width + 6, h: font + 4 };
  });
  const urut = items.map((_, i) => i).sort((i, j) => items[i].y - items[j].y || items[i].x - items[j].x);
  const off = susunLabel(urut.map(i => items[i]));
  urut.forEach((i, k) => {
    const el = labelKecamatan[i].marker.getElement();
    if (!el || !el.firstChild) return;
    el.firstChild.style.fontSize = font + "px";
    el.firstChild.style.transform = "translate(-50%,-50%) translate(" + off[k].dx + "px," + off[k].dy + "px)";
  });
}

function muatLabelKecamatan() {
  LABEL_KECAMATAN_HSU.forEach(item => {
    const marker = L.marker([Number(item.lat), Number(item.lon)], {
      icon: L.divIcon({ className: "kml-kecamatan-label", html: "<span>" + esc(item.name) + "</span>", iconSize: [1, 1], iconAnchor: [0, 0] }),
      interactive: false, keyboard: false, zIndexOffset: 1000
    }).addTo(map);
    labelKecamatan.push({ name: item.name, lat: Number(item.lat), lon: Number(item.lon), marker: marker });
  });
  map.on("zoomend moveend", aturLabelKecamatan);
  aturLabelKecamatan();
}

// ---------- Status tampilan ----------
let bidangAktif = null;   // id bidang, null = Beranda
let modulAktif = null;    // indeks modul di bidang aktif
let kecAktif = null;      // nama kecamatan terpilih

function pilihKecamatan(nama) {
  kecAktif = (kecAktif === nama) ? null : nama;
  Object.keys(poligonKec).forEach(n => poligonKec[n].setStyle(gayaKec(n)));
  labelKecamatan.forEach(l => { const el = l.marker.getElement(); if (el) el.classList.toggle("aktif", l.name === kecAktif); });
  gambarPanel();   // panel digambar dulu supaya ukuran area peta yang kosong sudah final
  sesuaikanPandangan(true);
}

function pilihBidang(id) {
  bidangAktif = (bidangAktif === id) ? null : id;
  modulAktif = null;
  gambarMenu();
  gambarPanel();
  $("dkBeranda").classList.toggle("aktif", bidangAktif === null);
  if (document.body.classList.contains("panel-tutup")) {
    document.body.classList.remove("panel-tutup");
    setTimeout(() => { sesuaikanPandangan(true); aturLabelKecamatan(); }, 320);
  }
}

function beranda() {
  bidangAktif = null; modulAktif = null;
  if (kecAktif) { kecAktif = null; Object.keys(poligonKec).forEach(n => poligonKec[n].setStyle(GAYA_KEC)); labelKecamatan.forEach(l => { const el = l.marker.getElement(); if (el) el.classList.remove("aktif"); }); }
  gambarMenu(); gambarPanel(); paskanKabupaten(true);
  $("dkBeranda").classList.add("aktif");
}

// Dipanggil saat data baru tiba. Tidak menggambar ulang panel selagi petugas sedang mengisi formulir (kecuali dipaksa).
function segarkanPanel(paksa) {
  const a = document.activeElement;
  if (!paksa && a && a.closest && a.closest("form")) return;
  gambarPanel();
}

// ---------- Menu atas ----------
function gambarMenu() {
  const buat = sisi => BIDANG.filter(b => b.sisi === sisi).map(b =>
    '<button type="button" class="nav-btn' + (b.id === bidangAktif ? " aktif" : "") + '" data-bidang="' + b.id + '" title="' + esc(b.nama) + '">' +
    ikon(b.ikon) + '<span class="tx">' + esc(b.nama) + '</span></button>').join("");
  $("navKiri").innerHTML = buat("kiri");
  $("navKanan").innerHTML = buat("kanan");
  $("dkBeranda").classList.toggle("aktif", bidangAktif === null);
}

// ---------- Panel ----------
function kartuStatusBanjir() {
  const judul = '<section class="kartu"><h2 class="kartu-judul">Status Siaga Banjir <small>Kabupaten</small></h2>';
  if (!SNAP) return judul + '<div class="kosong kecil">' + esc(pesanData()) + '</div></section>';
  const r = SNAP.ringkas, lv = LV[r.tertinggi];
  const teks = r.tertinggi === "Normal" ? "Seluruh kecamatan berstatus Normal"
    : "Tingkat tertinggi: " + r.tertinggi.toUpperCase() + "<small>" + r.teratas.filter(t => t.status !== "Normal").map(t => esc(t.n) + " (" + t.skor + ")").join(" · ") + "</small>";
  return judul + '<div class="banner lv' + lv + '">' + teks + '</div><div class="stat-grid">' +
    TINGKAT.map(t => '<div class="stat lv' + LV[t] + '"><b>' + (r.hitung[t] || 0) + '</b><span>' + t + '</span></div>').join("") +
    '</div><p class="catatan sumber">Jumlah kecamatan per tingkat · diperbarui ' + esc(SNAP.diperbarui.slice(11)) + ' WITA. Klik kecamatan untuk melihat rincian.</p></section>';
}

function kartuKecBanjir() {
  const c = pilih(); if (!c) return "";
  const lv = LV[c.skor.status], t = c.tma, h = c.hujan, d = c.debit;
  return '<section class="kartu"><h2 class="kartu-judul">Status Banjir <small>' + esc(kecAktif) + '</small></h2>' +
    '<div class="banner lv' + lv + '">' + esc(c.skor.status.toUpperCase()) + ' — skor ' + c.skor.risiko + ' / 100' +
      (c.skor.lengkap < 3 ? '<small>Hanya ' + c.skor.lengkap + ' dari 3 faktor ada datanya</small>' : "") + '</div>' +
    '<div class="ind-row">' +
      '<div class="ind"><b>' + (t ? fmtN(t.cm) + ' cm' : '—') + '</b><span>Tinggi muka air</span>' + (t ? '<em>' + esc(t.status) + ' · ' + esc(umurTeks(t.umurJam)) + (t.valid ? "" : " (kedaluwarsa)") + '</em>' : '<em>belum ada pembacaan</em>') + '</div>' +
      '<div class="ind"><b>' + (h ? fmtN(h.h3, 1) + ' mm' : '—') + '</b><span>Hujan 3 hari ke depan</span></div>' +
      '<div class="ind"><b>' + (d ? fmtN(d.now, 1) + ' m³/s' : '—') + '</b><span>Debit sungai</span>' + (d && d.rasio != null ? '<em>puncak ' + fmtN(d.rasio, 2) + '× rata-rata</em>' : '') + '</div>' +
      '<div class="ind"><b>' + (c.kes ? c.kes.pct + '%' : '—') + '</b><span>Kesiapan sumber daya</span></div>' +
    '</div><p class="catatan">' + esc(c.rekom[0]) + '</p></section>';
}

function gambarPanel() {
  const kiri = $("panelKiri"), kanan = $("panelKanan");
  const sempit = window.innerWidth <= 820;

  if (!bidangAktif) {
    // ===== BERANDA =====
    const st = ringkasStatus();
    const ik = kecAktif ? KEC.indexOf(kecAktif) : -1;
    const TOTAL_POP = 238435;
    let profil;
    if (ik >= 0) {
      // Kecamatan dipilih: tampilkan profil kecamatan tersebut, bukan kabupaten.
      const urutPop = POP.slice().sort((x, y) => y - x).indexOf(POP[ik]) + 1;
      profil =
        '<section class="kartu"><h2 class="kartu-judul">Profil Kecamatan <small>' + esc(kecAktif) + '</small></h2>' +
          '<div class="ind-row">' +
            '<div class="ind"><b>' + fmtN(POP[ik]) + '</b><span>Penduduk (jiwa)</span></div>' +
            '<div class="ind"><b>±' + fmtN(LUAS[ik], 1) + ' km²</b><span>Luas wilayah</span></div>' +
            '<div class="ind"><b>' + fmtN(DESA[ik]) + '</b><span>Desa + Kelurahan</span></div>' +
            '<div class="ind"><b>' + fmtN(KPD[ik]) + '</b><span>Jiwa per km²</span></div>' +
            '<div class="ind"><b>' + fmtN(POP[ik] / TOTAL_POP * 100, 1) + '%</b><span>Porsi penduduk kabupaten</span></div>' +
            '<div class="ind"><b>' + urutPop + ' / ' + KEC.length + '</b><span>Peringkat jumlah penduduk</span></div>' +
          '</div><p class="catatan sumber">Sumber: Dukcapil HSU Semester I 2025; luas dihitung dari poligon peta; jumlah desa/kelurahan: BPS HSU 2025. Klik kecamatan yang sama lagi untuk kembali ke tampilan kabupaten.</p></section>';
    } else {
      profil =
        '<section class="kartu"><h2 class="kartu-judul">Profil Wilayah <small>Ringkasan</small></h2>' +
          '<div class="ind-row">' +
            '<div class="ind"><b>' + fmtN(238435) + '</b><span>Penduduk (jiwa)</span></div>' +
            '<div class="ind"><b>±892,7 km²</b><span>Luas wilayah</span></div>' +
            '<div class="ind"><b>' + LABEL_KECAMATAN_HSU.length + '</b><span>Kecamatan</span></div>' +
            '<div class="ind"><b>214 / 5</b><span>Desa / Kelurahan</span></div>' +
          '</div><p class="catatan sumber">Sumber: Dukcapil HSU Semester I 2025; luas wilayah menurut Pemkab/BPS.</p></section>';
    }
    const status = ik >= 0 && pilih() ? kartuKecBanjir() : kartuStatusBanjir();
    const kecamatan =
      '<section class="kartu"><h2 class="kartu-judul">Kecamatan <small>Pilih untuk zoom</small></h2><ul class="daftar dua">' +
        LABEL_KECAMATAN_HSU.slice().sort((a, b) => a.name.localeCompare(b.name)).map(k => {
          const c = SNAP && SNAP.kec[k.name];
          return '<li><button type="button" data-kec="' + esc(k.name) + '" class="' + (c ? "lv" + LV[c.skor.status] + " " : "") + (k.name === kecAktif ? "aktif" : "") +
            '"' + (c ? ' title="' + esc(c.skor.status + " · skor " + c.skor.risiko) + '"' : "") + '>' + ikon("i-pin") + '<span>' + esc(k.name) + '</span></button></li>';
        }).join("") +
      '</ul><p class="catatan">Warna ikon menunjukkan tingkat siaga banjir saat ini.</p></section>';
    const bidang =
      '<section class="kartu"><h2 class="kartu-judul">Menu Pemantauan <small>Menu</small></h2><div class="grid-bidang">' +
        BIDANG.map(b => '<button type="button" data-bidang="' + b.id + '">' + ikon(b.ikon) + esc(b.nama) + '</button>').join("") +
      '</div><p class="catatan">Pilih menu untuk melihat prakiraan cuaca, tinggi muka air, debit, analisis kesiapan, dan laporan per kecamatan. ' +
        st[0] + ' dari ' + st[1] + ' modul sudah berisi data.</p></section>';
    const legenda =
      '<section class="kartu"><h2 class="kartu-judul">Tingkat Siaga <small>Skor 0–100</small></h2><div class="stat-grid">' +
        [["Normal", "< 25"], ["Waspada", "25–49"], ["Siaga", "50–74"], ["Awas", "≥ 75"]].map(t => '<div class="stat lv' + LV[t[0]] + '"><b style="font-size:16px">' + t[1] + '</b><span>' + t[0] + '</span></div>').join("") +
      '</div><p class="catatan">Skor dihitung otomatis dari curah hujan, tinggi muka air, dan debit sungai, lalu diperbesar oleh kepadatan penduduk.</p></section>';
    // Desktop: menu bidang di kiri; status banjir + profil wilayah + daftar kecamatan di kanan. HP: panel kanan disembunyikan, jadi semuanya di kiri.
    if (sempit) { kiri.innerHTML = status + profil + kecamatan; kanan.innerHTML = ""; }
    else { kiri.innerHTML = bidang + legenda; kanan.innerHTML = status + profil + kecamatan; }
    terapkanPeta();
    return;
  }

  // ===== BIDANG TERPILIH =====
  const b = BIDANG.find(x => x.id === bidangAktif);
  if (modulAktif === null) modulAktif = 0;
  const daftar = b.modul.map((_, i) => ambilData(b.id, i));
  const nAda = daftar.filter(d => d && d.s !== "tunggu").length;
  kiri.innerHTML =
    '<section class="kartu"><h2 class="kartu-judul">' + esc(b.nama) + ' <small>Modul</small></h2><ul class="daftar">' +
      b.modul.map((m, i) => {
        const d = daftar[i], s = d ? d.s : "tunggu";
        const tag = d && d.form && s !== "tunggu" ? ["link", "Input"] : s === "ada" ? ["ada", "Data"] : s === "link" ? ["link", "Dashboard"] : ["", "Menunggu"];
        return '<li><button type="button" data-modul="' + i + '" class="' + (i === modulAktif ? "aktif" : "") + '">' + ikon("i-item") +
          '<span>' + esc(m[0]) + '<span class="ket">' + esc(m[1]) + '</span></span><span class="tag ' + tag[0] + '">' + tag[1] + '</span></button></li>';
      }).join("") +
    '</ul><p class="catatan">' + nAda + ' dari ' + b.modul.length + ' modul pada menu ini sudah berisi data. Klik kecamatan pada peta atau grafik untuk membandingkan.</p></section>';

  const detail = detailModul(b, modulAktif);
  if (sempit) { kiri.innerHTML += detail; kanan.innerHTML = ""; } else kanan.innerHTML = detail;
  terapkanPeta();
}


function ringkasStatus() {
  let ada = 0, tot = 0;
  BIDANG.forEach(b => b.modul.forEach((m, i) => { tot++; const d = ambilData(b.id, i); if (d && d.s !== "tunggu") ada++; }));
  return [ada, tot];
}

function gambarGrafik(g) {
  const idx = g.labels.map((_, i) => i);
  const urut = g.urut === false ? idx : idx.slice().sort((a, c) => g.values[c] - g.values[a]);
  const maks = Math.max.apply(null, g.values) || 1;
  let sorot = "";
  const ik = g.labels.indexOf(kecAktif);
  if (kecAktif && ik >= 0)
    sorot = '<div class="sorot">' + esc(kecAktif) + ': <b>' + fmtN(g.values[ik], g.dec) + '</b> · peringkat ' + (urut.indexOf(ik) + 1) + ' dari ' + g.labels.length + '</div>';
  return '<div class="gr-blok"><div class="gr-judul">' + esc(g.judul) + '</div>' + sorot + '<div class="bars">' +
    urut.map(i => {
      const nm = g.labels[i], kec = KEC.indexOf(nm) >= 0;
      return '<div class="bar-row' + (nm === kecAktif ? " aktif" : "") + (kec ? " klik" : "") + '"' + (kec ? ' data-kec="' + esc(nm) + '"' : "") + '>' +
        '<span class="bn" title="' + esc(nm) + '">' + esc(nm) + '</span>' +
        '<span class="bt"><i style="width:' + Math.max(2, Math.max(0, g.values[i]) / maks * 100).toFixed(1) + '%"></i></span>' +
        '<span class="bv">' + fmtN(g.values[i], g.dec) + '</span></div>';
    }).join("") + '</div></div>';
}

// ---------- Formulir petugas ----------
function formHTML(jenis) {
  let petugas = "", pin = "";
  try { petugas = localStorage.getItem("petugasBanjir") || ""; pin = sessionStorage.getItem("pinBanjir") || ""; } catch (_) {}
  const c = pilih(), k = c && c.kes;
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
      '<button type="submit">Simpan pembacaan</button><p class="petunjuk">Waktu bacaan tidak boleh di masa depan atau lebih dari 7 hari lalu.</p></form>';
  const v = f => k ? ' value="' + esc(k[f]) + '"' : "";
  const num = (nama, label) => '<label>' + label + '<input name="' + nama + '" type="number" min="0" max="100000" step="1" required inputmode="numeric"' + v(nama) + '></label>';
  return '<form class="form-banjir" data-form="kesiapan">' + kec +
    '<div class="baris2">' + num("perahu", "Perahu (unit)") + num("posko", "Posko (unit)") + '</div>' +
    '<div class="baris2">' + num("relawan", "Relawan (orang)") + num("pompa", "Pompa (unit)") + '</div>' +
    num("logistik", "Logistik cukup untuk (hari)") + akhir +
    '<button type="submit">Simpan kesiapan</button><p class="petunjuk">Isi jumlah yang tersedia dan siap dipakai saat ini. Data terbaru menggantikan data sebelumnya dalam analisis; semua riwayat tetap tersimpan.</p></form>';
}

function blokAksi(d) {
  let h = "";
  if (d.link) h += '<a class="btn-link" href="' + esc(d.link.url) + '" target="_blank" rel="noopener">' + esc(d.link.teks) + ' ↗</a>';
  (d.aksi || []).forEach(a => { h += '<button type="button" class="btn-link sekunder" data-aksi="' + esc(a.id) + '">' + esc(a.teks) + '</button>'; });
  return h ? '<div class="aksi">' + h + '</div>' : "";
}

function detailModul(b, i) {
  const d = ambilData(b.id, i), m = b.modul[i];
  if (!d) return '<section class="kartu"><h2 class="kartu-judul">Indikator Utama <small>' + esc(m[0]) + '</small></h2><div class="kosong">Data belum tersedia.</div></section>';
  const nilai = v => LV[v] !== undefined ? '<span class="tingkat lv' + LV[v] + '">' + esc(v) + '</span>' : esc(v);
  let h = '<section class="kartu"><h2 class="kartu-judul">Indikator Utama <small>' + esc(m[0]) + '</small></h2><div class="ind-row">' +
    d.ind.map(x => '<div class="ind"><b>' + nilai(x[1]) + '</b><span>' + esc(x[0]) + '</span>' + (x[2] ? '<em>' + esc(x[2]) + '</em>' : "") + '</div>').join("") +
    '</div>' + (d.info ? '<p class="catatan">' + esc(d.info) + '</p>' : "") + '</section>';
  if (d.grafik) {
    h += '<section class="kartu"><h2 class="kartu-judul">Grafik <small>' + (d.peta !== undefined ? "Peta tematik aktif" : "Perbandingan") + '</small></h2>' +
      d.grafik.map(gambarGrafik).join("") + blokAksi(d) + '<p class="catatan sumber">Sumber: ' + esc(d.sumber) + '</p></section>';
  }
  if (d.form) {
    h += '<section class="kartu"><h2 class="kartu-judul">Formulir <small>' + (d.form === "tma" ? "Input TMA" : "Input kesiapan") + '</small></h2>' + formHTML(d.form) +
      (d.grafik ? "" : '<p class="catatan sumber">Sumber: ' + esc(d.sumber) + '</p>') + '</section>';
  } else if (!d.grafik) {
    h += '<section class="kartu"><h2 class="kartu-judul">' + (d.s === "tunggu" ? "Status Data <small>Menunggu</small>" : d.profil ? esc(d.profilJudul || "Keterangan") : "Keterangan") + '</h2>';
    if (d.s === "tunggu") h += '<div class="kosong kecil">' + esc(d.pesan || "Data belum terhubung.") + '</div>';
    if (d.profil) h += '<ul class="profil" style="margin-top:' + (d.s === "tunggu" ? 10 : 0) + 'px">' + d.profil.map(p => '<li>' + esc(p) + '</li>').join("") + '</ul>';
    h += blokAksi(d) + '<p class="catatan sumber">Sumber: ' + esc(d.sumber) + '</p></section>';
  }
  return h;
}


// ---------- Peta tematik (pewarnaan kecamatan mengikuti grafik modul aktif) ----------
let warnaKec = {};
function skala(t) {
  const a = [27, 79, 156], c = [39, 211, 255], e = [255, 210, 74];
  const [p, q, u] = t < .5 ? [a, c, t * 2] : [c, e, (t - .5) * 2];
  return "rgb(" + p.map((v, k) => Math.round(v + (q[k] - v) * u)).join(",") + ")";
}
// Skala tetap untuk skor risiko 0-100 (sama dengan tingkat siaga)
function warnaRisiko(v) { return v < 25 ? "#2fbf71" : v < 50 ? "#ffd24a" : v < 75 ? "#ff9a2e" : "#ff4d4d"; }
function gayaKec(n) {
  if (n === kecAktif) return { color: "#ffd24a", weight: 2.5, dashArray: null, fillColor: warnaKec[n] || "#ffd24a", fillOpacity: warnaKec[n] ? .6 : .15 };
  return warnaKec[n] ? Object.assign({}, GAYA_KEC, { fillColor: warnaKec[n], fillOpacity: .55 }) : GAYA_KEC;
}
function gayaSemua() {
  Object.keys(poligonKec).forEach(n => poligonKec[n].setStyle(gayaKec(n)));
  labelKecamatan.forEach(l => { const el = l.marker.getElement(); if (el) el.classList.toggle("aktif", l.name === kecAktif); });
}
function terapkanPeta() {
  warnaKec = {};
  const leg = $("legPeta");
  let g = null;
  if (bidangAktif && modulAktif !== null) {
    const d = ambilData(bidangAktif, modulAktif);
    if (d && d.peta !== undefined && d.grafik) g = d.grafik[d.peta];
  }
  if (g && g.skala === "risiko") {
    g.labels.forEach((n, i) => { warnaKec[n] = warnaRisiko(g.values[i]); });
    leg.style.display = "flex";
    leg.innerHTML = '<b>' + esc(g.judul) + '</b><span class="grad risiko"></span><span class="lr"><i>Normal</i><i>Waspada</i><i>Siaga</i><i>Awas</i></span>';
  } else if (g) {
    const mn = Math.min.apply(null, g.values), mx = Math.max.apply(null, g.values);
    g.labels.forEach((n, i) => { warnaKec[n] = skala(mx === mn ? .5 : (g.values[i] - mn) / (mx - mn)); });
    leg.style.display = "flex";
    leg.innerHTML = '<b>' + esc(g.judul) + '</b><span class="grad"></span><span class="lr"><i>' + fmtN(mn, g.dec) + '</i><i>' + fmtN(mx, g.dec) + '</i></span>';
  } else leg.style.display = "none";
  gayaSemua();
}

// Peta Beranda: warnai kecamatan menurut tingkat siaga bila data tersedia
const terapkanPetaAsli = terapkanPeta;
terapkanPeta = function () {
  terapkanPetaAsli();
  if (!bidangAktif && SNAP) {
    KEC.forEach(n => { if (SNAP.kec[n]) warnaKec[n] = warnaRisiko(SNAP.kec[n].skor.risiko); });
    const leg = $("legPeta"); leg.style.display = "flex";
    leg.innerHTML = '<b>Tingkat siaga banjir per kecamatan</b><span class="grad risiko"></span><span class="lr"><i>Normal</i><i>Waspada</i><i>Siaga</i><i>Awas</i></span>';
    gayaSemua();
  }
};

// ---------- Unduh rekap ----------
function unduhCSV() {
  const rows = REKAP && REKAP.baris;
  if (!rows || !rows.length) { toast("Belum ada data rekap untuk diunduh", "err"); return; }
  const q = v => '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"';
  const h = ["Tanggal", "Kecamatan", "Hujan hari ini (mm)", "Skor risiko maks", "Status tertinggi", "TMA maks (cm)", "Debit maks (m3/s)", "Kesiapan (%)", "Jumlah rekaman"];
  const csv = "﻿" + [h.map(q).join(",")].concat(rows.map(r => [r.t, r.kec, r.hujan, r.risiko, r.status, r.tma, r.debit, r.kes, r.n].map(q).join(","))).join("\r\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  a.download = "rekap-banjir-hsu-" + rows[rows.length - 1].t + ".csv";
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

// ---------- Interaksi ----------
document.addEventListener("click", e => {
  const bd = e.target.closest("[data-bidang]");
  if (bd) { pilihBidang(bd.dataset.bidang); return; }
  const kc = e.target.closest("[data-kec]");
  if (kc) { pilihKecamatan(kc.dataset.kec); return; }
  const md = e.target.closest("[data-modul]");
  if (md) { modulAktif = Number(md.dataset.modul); gambarPanel(); return; }
  const ak = e.target.closest("[data-aksi]");
  if (ak) { if (ak.dataset.aksi === "csv") unduhCSV(); return; }
  if (!e.target.closest("#popLayer") && !e.target.closest("#dkLayer")) $("popLayer").classList.remove("tampil");
});
document.addEventListener("submit", e => {
  const f = e.target.closest("form[data-form]");
  if (!f) return;
  e.preventDefault();
  kirimForm(f);
});

$("dkBeranda").addEventListener("click", beranda);
$("dkLayer").addEventListener("click", () => {
  const pop = $("popLayer"); pop.classList.toggle("tampil"); $("dkLayer").classList.toggle("aktif", pop.classList.contains("tampil"));
});
$("dkPanel").addEventListener("click", () => {
  document.body.classList.toggle("panel-tutup");
  setTimeout(() => { sesuaikanPandangan(true); aturLabelKecamatan(); }, 320);
});
$("dkFull").addEventListener("click", () => {
  try {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen();
  } catch (_) {}
});

document.querySelectorAll('input[name="dasar"]').forEach(r => r.addEventListener("change", () => {
  map.removeLayer(PETA_DASAR[dasarAktif]); dasarAktif = r.value; PETA_DASAR[dasarAktif].addTo(map).bringToBack();
}));
function sakelar(cb, aksi) { $(cb).addEventListener("change", e => aksi(e.target.checked)); }
sakelar("cbKab", on => on ? lapKabupaten.addTo(map) : map.removeLayer(lapKabupaten));
sakelar("cbKec", on => on ? lapKecamatan.addTo(map) : map.removeLayer(lapKecamatan));
sakelar("cbLabel", on => document.body.classList.toggle("tanpa-label", !on));

// ---------- Jam (WITA) ----------
function ketukJam() {
  const d = new Date();
  $("jam").textContent = d.toLocaleTimeString("id-ID", { timeZone: "Asia/Makassar", hour12: false }).replace(/\./g, ":");
  $("tgl").textContent = d.toLocaleDateString("id-ID", { timeZone: "Asia/Makassar", weekday: "long", day: "2-digit", month: "long", year: "numeric" }) + " WITA";
}

// ---------- Mulai ----------
function init() {
  gambarMenu(); gambarPanel();
  muatLabelKecamatan();
  paskanKabupaten(false);
  ketukJam(); setInterval(ketukJam, 1000);
  let sempitLama = window.innerWidth <= 820;
  window.addEventListener("resize", () => { sesuaikanPandangan(false); aturLabelKecamatan(); const s = window.innerWidth <= 820; if (s !== sempitLama) { sempitLama = s; gambarPanel(); } });
  setTimeout(() => { sesuaikanPandangan(false); aturLabelKecamatan(); }, 300);
  iniData();
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
