// Müşteri ekranı: firma linkiyle (?f=KOD) açılır.
import {
  satirlariAyir, kalemOlustur, katalogSatiri, katalogAra, teklifIstenenler, kararlarTamam, kararSonrasiDurum,
  hazirlanacakKalemler, musteriIptalEdebilir, wpLinki, wpMesaji, DURUM_ADI
} from './mantik.js';
import { ntfyGonder } from './veri.js';
import { $, esc, TL, tarihSaat, toast, modalAc, modalKapat, onayla, durumEtiketi, hataMesaji, depo } from './ortak.js';

let V, KOD, P, siparisler = [], katalog = null, sekme = 'yeni';
let taslak = { satirlar: [], not: '' };
const kararTaslak = {}; // sid -> {i: karar}
const TASLAK_ANAHTARI = () => 'taslak_' + KOD;

export async function musteriBaslat(veri, kod) {
  V = veri; KOD = kod;
  try {
    P = await V.portalGetir(kod);
  } catch (e) {
    return gecersiz(hataMesaji(e));
  }
  if (!P || P.aktif !== true) return gecersiz();
  $('baslik').textContent = P.firma_ad;
  $('altBaslik').textContent = (P.isletme_ad ? P.isletme_ad + ' · ' : '') + 'Sipariş sayfası';
  document.title = 'Sipariş · ' + P.firma_ad;
  taslak = depo.al(TASLAK_ANAHTARI()) || { satirlar: [], not: '' };
  if (!taslak.satirlar.length) taslak.satirlar.push(bosSatir());
  V.siparisleriDinle(kod, l => {
    siparisler = l;
    if (sekme === 'siparislerim') ciz(); else sekmeleriCiz();
  }, e => toast(hataMesaji(e), 'hata'));
  ciz();
}

function gecersiz(ek) {
  $('baslik').textContent = 'Sipariş';
  $('app').innerHTML = `<div class="buyuk-mesaj"><div class="ikon">🔒</div><h3>Bu bağlantı artık geçerli değil</h3>
    <p class="muted">${esc(ek || 'Yeni bağlantı için lütfen bizimle iletişime geçin.')}</p></div>`;
}

const bosSatir = () => ({ metin: '', teklif: false, katalog_id: null });
const taslakKaydet = () => depo.koy(TASLAK_ANAHTARI(), taslak);
const kararBekleyen = () => siparisler.filter(s => s.durum === 'teklif_gonderildi').length;

function sekmeleriCiz() {
  const n = kararBekleyen();
  const seg = $('seg');
  if (!seg) return;
  seg.innerHTML = `<button class="${sekme === 'yeni' ? 'on' : ''}" data-s="yeni">Yeni sipariş</button>
    <button class="${sekme === 'siparislerim' ? 'on' : ''}" data-s="siparislerim">Siparişlerim${n ? `<span class="rozet">${n}</span>` : ''}</button>`;
  seg.querySelectorAll('button').forEach(b => b.onclick = () => { sekme = b.dataset.s; ciz(); scrollTo(0, 0); });
}

function ciz() {
  $('app').innerHTML = `<div class="seg" id="seg"></div><div id="icerik"></div>`;
  sekmeleriCiz();
  if (sekme === 'yeni') yeniCiz(); else siparislerimCiz();
}

// ---------- Yeni sipariş ----------
function yeniCiz() {
  const n = kararBekleyen();
  $('icerik').innerHTML = `
    ${n ? `<div class="uyari" id="teklifUyari">💬 ${n} siparişiniz için fiyat teklifi geldi. <u>Görmek için dokunun</u></div>` : ''}
    <div class="card">
      <div class="row"><b>Ne istiyorsunuz?</b><span class="muted">Her satıra bir kalem</span></div>
      <div id="satirlar"></div>
      <div class="btns">
        <button class="btn ghost kucuk" id="satirEkle">+ Satır</button>
        <button class="btn ghost kucuk" id="katalogBtn">📋 Katalogdan seç</button>
        <button class="btn ghost kucuk" id="yapistirBtn">📝 Toplu yapıştır</button>
      </div>
      <p class="muted" style="margin:10px 0 0">Fiyatını öğrenmek istediğiniz kalemde <b>“Fiyat iste”</b> kutusunu işaretleyin. Fiyat gelince onaylarsınız.</p>
    </div>
    <div class="card"><label class="l" style="margin-top:0">Not (isteğe bağlı)</label>
      <textarea id="not" rows="2" placeholder="Teslim zamanı, adres vb.">${esc(taslak.not)}</textarea></div>
    <div class="sabit-alt"><button class="btn block" id="gonderBtn">Siparişi gönder</button></div>`;
  if (n) $('teklifUyari').onclick = () => { sekme = 'siparislerim'; ciz(); };
  satirlariCiz();
  $('satirEkle').onclick = () => { taslak.satirlar.push(bosSatir()); taslakKaydet(); satirlariCiz(true); };
  $('katalogBtn').onclick = katalogAc;
  $('yapistirBtn').onclick = yapistirAc;
  $('not').oninput = e => { taslak.not = e.target.value; taslakKaydet(); };
  $('gonderBtn').onclick = gonder;
}

function satirlariCiz(sonaOdaklan = false) {
  const kutu = $('satirlar');
  kutu.innerHTML = taslak.satirlar.map((s, i) => `
    <div class="satir">
      <span class="no">${i + 1}.</span>
      <input type="text" data-i="${i}" value="${esc(s.metin)}" placeholder="örn. 1 adet 10 düz freze h100" enterkeyhint="next">
      <label class="fiyat-iste"><input type="checkbox" data-t="${i}" ${s.teklif ? 'checked' : ''}>Fiyat iste</label>
      <button class="sil" data-sil="${i}" aria-label="Satırı sil">×</button>
    </div>`).join('');
  kutu.querySelectorAll('input[type=text]').forEach(inp => {
    inp.oninput = () => { const s = taslak.satirlar[+inp.dataset.i]; s.metin = inp.value; s.katalog_id = null; taslakKaydet(); };
    inp.onkeydown = e => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const i = +inp.dataset.i;
      if (i === taslak.satirlar.length - 1) { taslak.satirlar.push(bosSatir()); taslakKaydet(); satirlariCiz(true); }
      else kutu.querySelector(`input[data-i="${i + 1}"]`).focus();
    };
  });
  kutu.querySelectorAll('[data-t]').forEach(c => c.onchange = () => { taslak.satirlar[+c.dataset.t].teklif = c.checked; taslakKaydet(); });
  kutu.querySelectorAll('[data-sil]').forEach(b => b.onclick = () => {
    taslak.satirlar.splice(+b.dataset.sil, 1);
    if (!taslak.satirlar.length) taslak.satirlar.push(bosSatir());
    taslakKaydet(); satirlariCiz();
  });
  if (sonaOdaklan) { const l = kutu.querySelectorAll('input[type=text]'); l[l.length - 1].focus(); }
}

function satirlariEkle(yeniler) {
  taslak.satirlar = taslak.satirlar.filter(s => s.metin.trim());
  taslak.satirlar.push(...yeniler);
  taslakKaydet(); satirlariCiz();
}

function yapistirAc() {
  const s = modalAc(`<h3>Toplu yapıştır</h3>
    <p class="muted">WhatsApp'a yazar gibi yazın ya da yapıştırın. Her satır ayrı kalem olur.</p>
    <textarea id="topluMetin" rows="8" placeholder="1 adet 10 düz freze h100&#10;2 kutu 20 küre ucu"></textarea>
    <label class="fiyat-iste" style="flex-direction:row;width:auto;gap:8px;margin-top:10px;font-size:14px"><input type="checkbox" id="topluTeklif">Hepsi için fiyat iste</label>
    <div class="btns"><button class="btn ghost" id="vz">Vazgeç</button><button class="btn" id="ekle">Ekle</button></div>`);
  setTimeout(() => $('topluMetin').focus(), 100);
  s.querySelector('#vz').onclick = modalKapat;
  s.querySelector('#ekle').onclick = () => {
    const l = satirlariAyir($('topluMetin').value);
    if (!l.length) return toast('Yazılı kalem yok');
    const teklif = $('topluTeklif').checked;
    satirlariEkle(l.map(m => kalemOlustur(m, teklif)));
    modalKapat(); toast(`${l.length} kalem eklendi`);
  };
}

async function katalogAc() {
  const s = modalAc(`<h3>Katalog</h3><input id="kAra" type="search" placeholder="Ürün ara…" autocomplete="off"><div id="kListe"><div class="empty">Yükleniyor…</div></div>
    <div class="btns"><button class="btn ghost" id="kKapat">Kapat</button></div>`);
  s.querySelector('#kKapat').onclick = modalKapat;
  try { if (!katalog) katalog = await V.katalogGetir(); } catch (e) { return toast(hataMesaji(e), 'hata'); }
  const listele = () => {
    const l = katalogAra(katalog, $('kAra').value);
    $('kListe').innerHTML = l.length ? l.map(u => `<div class="urun" data-id="${esc(u.id)}"><div><div>${esc(u.ad)}</div>${u.kategori ? `<div class="muted">${esc(u.kategori)}</div>` : ''}</div><span class="muted">${esc(u.birim)}</span></div>`).join('')
      : `<div class="empty">${katalog.length ? 'Bulunamadı. Katalogda yoksa satıra kendiniz yazabilirsiniz.' : 'Katalog henüz boş. Satırlara kendiniz yazabilirsiniz.'}</div>`;
    $('kListe').querySelectorAll('.urun').forEach(d => d.onclick = () => miktarSor(katalog.find(u => u.id === d.dataset.id)));
  };
  $('kAra').oninput = listele;
  listele();
}

function miktarSor(u) {
  const s = modalAc(`<h3>${esc(u.ad)}</h3><label class="l">Kaç ${esc(u.birim)}?</label>
    <div class="miktar"><button id="az">−</button><input id="mk" inputmode="decimal" value="1"><button id="cok">+</button><span>${esc(u.birim)}</span></div>
    <label class="fiyat-iste" style="flex-direction:row;width:auto;gap:8px;margin-top:14px;font-size:14px"><input type="checkbox" id="mTeklif">Fiyat iste</label>
    <div class="btns"><button class="btn ghost" id="geri">Geri</button><button class="btn" id="ekle">Ekle</button></div>`);
  const mk = s.querySelector('#mk');
  const deger = () => { const n = parseFloat(String(mk.value).replace(',', '.')); return isNaN(n) ? 0 : n; };
  s.querySelector('#az').onclick = () => { mk.value = Math.max(1, deger() - 1); };
  s.querySelector('#cok').onclick = () => { mk.value = deger() + 1; };
  s.querySelector('#geri').onclick = katalogAc;
  s.querySelector('#ekle').onclick = () => {
    const n = deger();
    if (n <= 0) return toast('Miktar girin');
    satirlariEkle([kalemOlustur(katalogSatiri(u, String(mk.value).trim()), $('mTeklif').checked, u.id)]);
    katalogAc();
    toast('Eklendi: ' + katalogSatiri(u, String(mk.value).trim()));
  };
}

async function gonder() {
  const kalemler = taslak.satirlar.filter(s => s.metin.trim()).map(s => kalemOlustur(s.metin, s.teklif, s.katalog_id));
  if (!kalemler.length) return toast('En az bir kalem yazın');
  const teklifli = kalemler.filter(k => k.teklif).length;
  const ozet = kalemler.map((k, i) => `${i + 1}. ${k.metin}${k.teklif ? ' (fiyat)' : ''}`).join('\n');
  if (!(await onayla(`${kalemler.length} kalem gönderilecek${teklifli ? `, ${teklifli} tanesi için fiyat teklifi istenecek` : ''}:\n\n${ozet}`, { evet: 'Gönder' }))) return;
  const btn = $('gonderBtn'); btn.disabled = true; btn.textContent = 'Gönderiliyor…';
  try {
    await V.siparisVer(KOD, P, kalemler, taslak.not.trim());
  } catch (e) {
    btn.disabled = false; btn.textContent = 'Siparişi gönder';
    return toast(hataMesaji(e), 'hata');
  }
  const sip = { firma_ad: P.firma_ad, kalemler, not: taslak.not.trim() };
  ntfyGonder(P.ntfy_konu, `Yeni sipariş: ${P.firma_ad}`, wpMesaji(sip, ''));
  taslak = { satirlar: [bosSatir()], not: '' }; depo.sil(TASLAK_ANAHTARI());
  const s = modalAc(`<div class="buyuk-mesaj" style="padding:16px"><div class="ikon">✅</div><h3>Siparişiniz alındı</h3>
    <p class="muted">${teklifli ? 'Fiyat teklifi hazır olunca “Siparişlerim” bölümünde göreceksiniz.' : 'Hazırlanınca durumu “Siparişlerim” bölümünden takip edebilirsiniz.'}</p></div>
    <div class="btns" style="flex-direction:column">
      ${P.wp_numara ? `<a class="btn block" style="text-align:center;text-decoration:none;background:#25d366;color:#fff" target="_blank" rel="noopener" href="${esc(wpLinki(P.wp_numara, wpMesaji(sip, P.isletme_ad)))}">WhatsApp'tan haber ver</a>` : ''}
      <button class="btn ghost block" id="tamam">Tamam</button></div>`);
  s.querySelector('#tamam').onclick = () => { modalKapat(); sekme = 'siparislerim'; ciz(); };
  sekme = 'siparislerim'; ciz();
}

// ---------- Siparişlerim ----------
function siparislerimCiz() {
  if (!siparisler.length) {
    $('icerik').innerHTML = '<div class="empty">Henüz siparişiniz yok.</div>';
    return;
  }
  $('icerik').innerHTML = siparisler.map(siparisKarti).join('');
  siparisler.forEach(s => baglaKart(s));
}

function siparisKarti(s) {
  const teklifIdx = new Set(teklifIstenenler(s));
  const kt = kararTaslak[s.id] || {};
  const karar = s.durum === 'teklif_gonderildi';
  const hazir = new Set(hazirlanacakKalemler(s));
  const h = s.hazirlik || {};
  const hazirlikVar = ['onaylandi', 'hazirlaniyor', 'hazir', 'teslim_edildi'].includes(s.durum);
  const kalemler = s.kalemler.map((k, i) => {
    const t = s.teklif?.[i];
    const cikti = (s.kararlar?.[i] === 'cikarildi') || (karar && kt[i] === 'cikarildi');
    let sag = '';
    if (hazirlikVar && hazir.has(i)) sag = h[i] ? '<span title="Hazırlandı">✅</span>' : '<span class="muted">⏳</span>';
    return `<div class="kalem ${cikti ? 'cikti' : ''}"><div class="m"><span class="mt">${esc(k.metin)}</span>
      ${teklifIdx.has(i) ? (t ? `<div class="money" style="margin-top:3px">${TL(t.fiyat)}${t.not ? ` <span class="muted">· ${esc(t.not)}</span>` : ''}</div>` : '<div class="fi">Fiyat bekleniyor</div>') : ''}
      ${karar && teklifIdx.has(i) ? `<div class="karar" data-sid="${esc(s.id)}" data-i="${i}">
          <button class="ok ${kt[i] === 'onaylandi' ? 'on' : ''}" data-k="onaylandi">✓ Onayla</button>
          <button class="no ${kt[i] === 'cikarildi' ? 'on' : ''}" data-k="cikarildi">✕ Çıkar</button></div>` : ''}
      ${!karar && s.kararlar?.[i] === 'cikarildi' ? '<div class="muted">Çıkarıldı</div>' : ''}
      </div>${sag}</div>`;
  }).join('');
  const onayliToplam = [...teklifIdx].filter(i => (karar ? kt[i] : s.kararlar?.[i]) === 'onaylandi').reduce((a, i) => a + (s.teklif?.[i]?.fiyat || 0), 0);
  const tamam = karar && kararlarTamam(s, kt);
  const ilerleme = hazirlikVar && hazir.size ? Math.round([...hazir].filter(i => h[i]).length / hazir.size * 100) : null;
  return `<div class="card" id="k_${esc(s.id)}">
    <div class="row"><span class="muted">${tarihSaat(s.olusturma)}</span>${durumEtiketi(s.durum, DURUM_ADI[s.durum])}</div>
    ${karar ? '<div class="uyari" style="margin:10px 0 0">Fiyatlar geldi. Her kalem için onaylayın ya da çıkarın, sonra gönderin.</div>' : ''}
    <div style="margin-top:6px">${kalemler}</div>
    ${s.not ? `<div class="muted" style="margin-top:6px">Not: ${esc(s.not)}</div>` : ''}
    ${ilerleme !== null && s.durum !== 'teslim_edildi' ? `<div class="ilerleme"><i style="width:${ilerleme}%"></i></div><div class="muted" style="margin-top:4px">Hazırlık %${ilerleme}</div>` : ''}
    ${teklifIdx.size && onayliToplam ? `<div class="row" style="margin-top:8px"><span class="muted">Onaylanan teklif toplamı</span><span class="money">${TL(onayliToplam)}</span></div>` : ''}
    <div class="btns">
      ${karar ? `<button class="btn" data-gonder="${esc(s.id)}" ${tamam ? '' : 'disabled'}>Kararımı gönder</button>` : ''}
      ${musteriIptalEdebilir(s) ? `<button class="btn ghost kucuk" data-iptal="${esc(s.id)}">Siparişi iptal et</button>` : ''}
    </div></div>`;
}

function baglaKart(s) {
  const kart = $('k_' + s.id); if (!kart) return;
  kart.querySelectorAll('.karar button').forEach(b => b.onclick = () => {
    const d = b.parentElement;
    (kararTaslak[d.dataset.sid] ||= {})[d.dataset.i] = b.dataset.k;
    kart.outerHTML = siparisKarti(s);
    baglaKart(s);
  });
  const g = kart.querySelector('[data-gonder]');
  if (g) g.onclick = async () => {
    const kt = kararTaslak[s.id] || {};
    const sonuc = kararSonrasiDurum(s, kt);
    const mesaj = sonuc === 'iptal' ? 'Bütün kalemleri çıkardınız. Sipariş iptal edilecek. Emin misiniz?' : 'Kararınız gönderilsin mi? Onayladığınız kalemler hazırlanmaya başlanacak.';
    if (!(await onayla(mesaj, { evet: 'Gönder', tehlikeli: sonuc === 'iptal' }))) return;
    try {
      await V.kararGonder(KOD, s.id, kt);
      delete kararTaslak[s.id];
      const onay = Object.values(kt).filter(x => x === 'onaylandi').length;
      ntfyGonder(P.ntfy_konu, `Teklif ${sonuc === 'iptal' ? 'reddedildi' : 'onaylandı'}: ${P.firma_ad}`, `${onay} kalem onaylandı, ${Object.keys(kt).length - onay} kalem çıkarıldı.`);
      toast(sonuc === 'iptal' ? 'Sipariş iptal edildi' : 'Gönderildi, teşekkürler');
    } catch (e) { toast(hataMesaji(e), 'hata'); }
  };
  const ip = kart.querySelector('[data-iptal]');
  if (ip) ip.onclick = async () => {
    if (!(await onayla('Bu sipariş iptal edilsin mi?', { evet: 'İptal et', tehlikeli: true }))) return;
    try { await V.siparisIptal(KOD, s.id); ntfyGonder(P.ntfy_konu, `Sipariş iptal: ${P.firma_ad}`, s.kalemler.map(k => k.metin).join('\n')); toast('Sipariş iptal edildi'); }
    catch (e) { toast(hataMesaji(e), 'hata'); }
  };
}
