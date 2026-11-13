// Yönetici ekranı: giriş, siparişler (gelen / hazırla / biten), firmalar, katalog, ayarlar.
import {
  satirlariAyir, kalemOlustur, teklifIstenenler, hazirlanacakKalemler, hazirMi, wpLinki, kodUret, DURUM_ADI, katalogAra
} from './mantik.js';
import { ntfyGonder } from './veri.js';
import { $, esc, TL, sayiOku, tarihSaat, toast, modalAc, modalKapat, onayla, durumEtiketi, hataMesaji, bip, depo } from './ortak.js';

let V, AUTH, FA, BEN = null;
let siparisler = [], firmalar = [], katalog = [], ayar = {};
let sekme = depo.al('ySekme') || 'gelen', hazirlaFiltre = 'hepsi', katalogSorgu = '';
let ilkYukleme = true, bekleyenCiz = false;
const oncekiDurum = new Map();
const teklifTaslak = {}; // sid -> {i: {fiyat, not}}
const kapatlar = [];

const SEKMELER = [
  ['gelen', '📥', 'Gelen'], ['hazirla', '🧰', 'Hazırla'], ['biten', '✅', 'Biten'], ['firmalar', '🏢', 'Firmalar'], ['katalog', '📋', 'Katalog']
];

export function yoneticiBaslat(veri, auth, fa) {
  V = veri; AUTH = auth; FA = fa;
  FA.onAuthStateChanged(AUTH, async u => {
    kapatlar.splice(0).forEach(f => f());
    if (!u) { BEN = null; return girisCiz(); }
    const y = await V.yoneticiMi(u.uid);
    if (!y) { await FA.signOut(AUTH); return girisCiz('Bu hesap yetkili değil.'); }
    BEN = { uid: u.uid, ad: y.ad || u.email };
    depo.koy('yoneticiCihaz', 1);
    basla();
  });
}

// ---------- Giriş ----------
function girisCiz(hata = '') {
  $('altMenu').hidden = true;
  $('baslik').textContent = 'Sipariş Yönetimi';
  $('altBaslik').textContent = '';
  $('ustSag').innerHTML = '';
  $('app').innerHTML = `<div class="card" style="margin-top:20px"><h3>Giriş</h3>
    ${hata ? `<div class="uyari">${esc(hata)}</div>` : ''}
    <form id="giris"><label class="l">E-posta</label><input id="ep" type="email" autocomplete="username" required>
    <label class="l">Şifre</label><input id="sf" type="password" autocomplete="current-password" required>
    <div class="btns"><button class="btn" type="submit">Giriş yap</button></div></form></div>
    <p class="muted" style="text-align:center">Müşteriyseniz size gönderilen sipariş linkini açın.</p>`;
  $('giris').onsubmit = async e => {
    e.preventDefault();
    const b = e.target.querySelector('button'); b.disabled = true; b.textContent = 'Giriliyor…';
    try { await FA.signInWithEmailAndPassword(AUTH, $('ep').value.trim(), $('sf').value); }
    catch (er) { girisCiz(hataMesaji(er)); }
  };
}

// ---------- Başlangıç ----------
async function basla() {
  $('baslik').textContent = 'Siparişler';
  $('altBaslik').textContent = BEN.ad;
  $('ustSag').innerHTML = '<button id="ayarBtn">⚙ Ayarlar</button>';
  $('ayarBtn').onclick = ayarlarAc;
  try { ayar = await V.ayarGetir(); } catch { ayar = {}; }
  ilkYukleme = true;
  kapatlar.push(V.tumSiparisleriDinle(l => { siparisler = l; bildirimKontrol(); ciz(); }, e => toast(hataMesaji(e), 'hata')));
  kapatlar.push(V.firmalariDinle(l => { firmalar = l; ciz(); }));
  kapatlar.push(V.katalogDinle(l => { katalog = l; if (sekme === 'katalog') ciz(); }));
  document.addEventListener('focusout', () => { if (bekleyenCiz) setTimeout(() => { if (!yaziyor()) ciz(); }, 50); });
  ciz();
}

function bildirimKontrol() {
  let yeni = 0, onay = 0;
  for (const s of siparisler) {
    const eski = oncekiDurum.get(s.id);
    if (!ilkYukleme) {
      if (eski === undefined && s.kaynak === 'musteri') yeni++;
      else if (eski === 'teklif_gonderildi' && s.durum !== eski) onay++;
    }
    oncekiDurum.set(s.id, s.durum);
  }
  ilkYukleme = false;
  if (yeni || onay) {
    bip();
    toast(yeni ? `🔔 ${yeni} yeni sipariş geldi` : '🔔 Müşteri teklife cevap verdi');
  }
}

const yaziyor = () => { const a = document.activeElement; return a && a.closest && a.closest('#app') && a.matches('input:not([type=checkbox]):not([type=radio]),textarea,select'); };
const firmaBul = fid => firmalar.find(f => f.id === fid);
const linkOlustur = kod => location.origin + location.pathname + '?f=' + kod;
const benim = s => s.alan?.uid === BEN.uid;

function gruplar() {
  const g = { gelen: [], hazirla: [], biten: [] };
  const sinir = Date.now() - 30 * 864e5;
  for (const s of siparisler) {
    if (s.durum === 'teklif_bekliyor' || s.durum === 'teklif_gonderildi' || (s.durum === 'onaylandi' && !s.alan)) g.gelen.push(s);
    else if (['onaylandi', 'hazirlaniyor', 'hazir'].includes(s.durum)) g.hazirla.push(s);
    else {
      const t = s.guncelleme?.toMillis ? s.guncelleme.toMillis() : Date.now();
      if (t >= sinir) g.biten.push(s);
    }
  }
  return g;
}

function menuCiz() {
  const g = gruplar();
  const rozet = { gelen: g.gelen.filter(s => s.durum !== 'teklif_gonderildi').length, hazirla: g.hazirla.filter(s => s.durum !== 'hazir').length };
  const m = $('altMenu'); m.hidden = false;
  m.innerHTML = SEKMELER.map(([k, ic, ad]) => `<button class="${sekme === k ? 'on' : ''}" data-s="${k}"><span class="ic">${ic}</span>${ad}${rozet[k] ? `<span class="rozet">${rozet[k]}</span>` : ''}</button>`).join('');
  m.querySelectorAll('button').forEach(b => b.onclick = () => { sekme = b.dataset.s; depo.koy('ySekme', sekme); ciz(); scrollTo(0, 0); });
}

function ciz() {
  if (!BEN) return;
  if (yaziyor()) { bekleyenCiz = true; menuCiz(); return; }
  bekleyenCiz = false;
  menuCiz();
  const g = gruplar();
  const app = $('app');
  if (sekme === 'gelen') {
    app.innerHTML = `<button class="btn ghost block" id="elleBtn">+ WhatsApp'tan gelen siparişi gir</button><div style="height:12px"></div>` +
      (g.gelen.length ? g.gelen.map(kart).join('') : '<div class="empty">Bekleyen yeni sipariş yok.</div>');
    $('elleBtn').onclick = elleSiparisAc;
  } else if (sekme === 'hazirla') {
    const l = g.hazirla.filter(s => hazirlaFiltre === 'hepsi' || benim(s));
    const firmaGrup = {};
    l.forEach(s => (firmaGrup[s.firma_ad] ||= []).push(s));
    app.innerHTML = `<div class="seg"><button data-f="hepsi" class="${hazirlaFiltre === 'hepsi' ? 'on' : ''}">Hepsi (${g.hazirla.length})</button><button data-f="benim" class="${hazirlaFiltre === 'benim' ? 'on' : ''}">Bende olanlar (${g.hazirla.filter(benim).length})</button></div>` +
      (l.length ? Object.keys(firmaGrup).sort((a, b) => a.localeCompare(b, 'tr')).map(f => `<div class="firma-baslik"><b>🏢 ${esc(f)}</b><span class="muted">${firmaGrup[f].length} sipariş</span></div>` + firmaGrup[f].map(kart).join('')).join('')
        : '<div class="empty">Hazırlanacak sipariş yok.</div>');
    app.querySelectorAll('[data-f]').forEach(b => b.onclick = () => { hazirlaFiltre = b.dataset.f; ciz(); });
  } else if (sekme === 'biten') {
    app.innerHTML = '<p class="muted">Son 30 günde teslim edilen ve iptal olan siparişler.</p>' + (g.biten.length ? g.biten.map(kart).join('') : '<div class="empty">Kayıt yok.</div>');
  } else if (sekme === 'firmalar') return firmalarCiz();
  else if (sekme === 'katalog') return katalogCiz();
  for (const s of siparisler) baglaKart(s);
}

// ---------- Sipariş kartı ----------
function kart(s) {
  const teklifIdx = teklifIstenenler(s);
  const tSet = new Set(teklifIdx);
  const tt = teklifTaslak[s.id] || {};
  const teklifDuzenlenir = s.durum === 'teklif_bekliyor' || s.durum === 'teklif_gonderildi';
  const hazirlikModu = ['onaylandi', 'hazirlaniyor', 'hazir'].includes(s.durum);
  const hz = new Set(hazirlanacakKalemler(s));
  const h = s.hazirlik || {};
  const f = firmaBul(s.fid);
  const kalemler = s.kalemler.map((k, i) => {
    const cikti = s.kararlar?.[i] === 'cikarildi';
    const t = s.teklif?.[i];
    const fiyatDeger = tt[i]?.fiyat ?? (t ? String(t.fiyat).replace('.', ',') : '');
    const notDeger = tt[i]?.not ?? (t?.not || '');
    let ek = '';
    if (tSet.has(i)) {
      if (teklifDuzenlenir) {
        ek = `<div class="row" style="margin-top:6px;gap:6px"><input data-fiyat="${i}" inputmode="decimal" placeholder="Fiyat ₺" value="${esc(fiyatDeger)}" style="flex:1">
          <input data-not="${i}" placeholder="Not (birim fiyat vb.)" value="${esc(notDeger)}" style="flex:1.4"></div>`;
      } else if (t) {
        ek = `<div class="money" style="margin-top:3px">${TL(t.fiyat)}${t.not ? ` <span class="muted">· ${esc(t.not)}</span>` : ''} ${s.kararlar?.[i] === 'onaylandi' ? '<span class="tag d-onaylandi">Onaylandı</span>' : cikti ? '<span class="tag d-iptal">Çıkarıldı</span>' : ''}</div>`;
      }
    }
    const tik = hazirlikModu && hz.has(i)
      ? `<input type="checkbox" class="tik" data-tik="${i}" ${h[i] ? 'checked' : ''} aria-label="Hazırlandı">` : '';
    return `<div class="kalem ${cikti ? 'cikti' : ''}">${tik}<div class="m"><span class="mt">${esc(k.metin)}</span>
      ${tSet.has(i) && !t && !teklifDuzenlenir ? '<div class="fi">Fiyat istendi</div>' : ''}
      ${tSet.has(i) && teklifDuzenlenir ? '<div class="fi">Fiyat istendi</div>' : ''}${ek}
      ${h[i] ? `<div class="muted">✓ ${esc(h[i].kim)}</div>` : ''}</div></div>`;
  }).join('');
  const toplam = teklifIdx.filter(i => s.kararlar?.[i] !== 'cikarildi').reduce((a, i) => a + (s.teklif?.[i]?.fiyat || 0), 0);
  const kimde = s.alan ? (benim(s) ? '<span class="tag d-hazirlaniyor">👤 Bende</span>' : `<span class="tag">👤 ${esc(s.alan.ad)}</span>`) : '<span class="tag d-teklif_bekliyor">Kimse almadı</span>';
  const butonlar = [];
  if (!['teslim_edildi', 'iptal'].includes(s.durum)) {
    if (!benim(s)) butonlar.push(`<button class="btn kucuk" data-al>${s.alan ? 'Devral' : 'Ben alıyorum'}</button>`);
    else butonlar.push('<button class="btn ghost kucuk" data-birak>Bırak</button>');
  }
  if (s.durum === 'teklif_bekliyor') butonlar.push('<button class="btn kucuk" data-teklif>Teklifi gönder</button>');
  if (s.durum === 'teklif_gonderildi') butonlar.push('<button class="btn ghost kucuk" data-teklif>Teklifi güncelle</button>');
  if (s.durum === 'onaylandi' || s.durum === 'hazirlaniyor') butonlar.push(`<button class="btn kucuk" data-hazir ${hazirMi(s) ? '' : 'disabled'}>Hazır</button>`);
  if (s.durum === 'hazir') butonlar.push('<button class="btn kucuk" data-teslim>Teslim edildi</button>');
  if (!['teslim_edildi', 'iptal', 'hazir'].includes(s.durum)) butonlar.push('<button class="btn ghost kucuk" data-iptal>İptal</button>');
  if (['teslim_edildi', 'iptal'].includes(s.durum)) butonlar.push('<button class="btn ghost kucuk" data-sil>Sil</button>');
  if (s.durum === 'teslim_edildi') butonlar.push('<button class="btn ghost kucuk" data-geri>Geri al</button>');
  const hzSay = [...hz].filter(i => h[i]).length;
  return `<div class="card" id="y_${s.id}">
    <div class="row"><b>${esc(s.firma_ad)}</b>${durumEtiketi(s.durum, DURUM_ADI[s.durum])}</div>
    <div class="row" style="margin-top:4px"><span class="muted">${tarihSaat(s.olusturma)}${s.kaynak === 'yonetici' ? ' · WhatsApp' : ''}</span>${kimde}</div>
    ${s.durum === 'teklif_gonderildi' ? '<div class="muted" style="margin-top:6px">Müşterinin kararı bekleniyor.</div>' : ''}
    <div style="margin-top:6px">${kalemler}</div>
    ${s.not ? `<div class="uyari" style="margin:8px 0 0">📝 ${esc(s.not)}</div>` : ''}
    ${hazirlikModu && hz.size ? `<div class="ilerleme"><i style="width:${Math.round(hzSay / hz.size * 100)}%"></i></div><div class="muted" style="margin-top:4px">${hzSay}/${hz.size} kalem hazır</div>` : ''}
    ${toplam && !teklifDuzenlenir ? `<div class="row" style="margin-top:6px"><span class="muted">Teklif toplamı</span><span class="money">${TL(toplam)}</span></div>` : ''}
    ${f?.telefon ? `<div style="margin-top:8px"><a class="muted" target="_blank" rel="noopener" href="${esc(wpLinki(f.telefon, ''))}">💬 Firmaya WhatsApp yaz</a></div>` : ''}
    <div class="btns">${butonlar.join('')}</div></div>`;
}

function baglaKart(s) {
  const k = $('y_' + s.id); if (!k) return;
  const q = sel => k.querySelector(sel);
  const hata = e => toast(hataMesaji(e), 'hata');
  k.querySelectorAll('[data-fiyat]').forEach(i => i.oninput = () => { ((teklifTaslak[s.id] ||= {})[i.dataset.fiyat] ||= {}).fiyat = i.value; });
  k.querySelectorAll('[data-not]').forEach(i => i.oninput = () => { ((teklifTaslak[s.id] ||= {})[i.dataset.not] ||= {}).not = i.value; });
  k.querySelectorAll('[data-tik]').forEach(c => c.onchange = async () => {
    try { await V.kalemTikle(s.kod, s.id, +c.dataset.tik, c.checked, BEN); } catch (e) { c.checked = !c.checked; hata(e); }
  });
  if (q('[data-al]')) q('[data-al]').onclick = async () => {
    try {
      let r = await V.siparisAl(s.kod, s.id, BEN);
      if (!r.ok) {
        if (!(await onayla(`Bu siparişi ${r.alan.ad} almış. Siz devralmak istiyor musunuz?`, { evet: 'Devral' }))) return;
        r = await V.siparisAl(s.kod, s.id, BEN, true);
      }
      toast('Sipariş sizde');
    } catch (e) { hata(e); }
  };
  if (q('[data-birak]')) q('[data-birak]').onclick = async () => { try { await V.birak(s.kod, s.id); } catch (e) { hata(e); } };
  if (q('[data-teklif]')) q('[data-teklif]').onclick = () => teklifGonder(s);
  if (q('[data-hazir]')) q('[data-hazir]').onclick = async () => { try { await V.durumYap(s.kod, s.id, 'hazir'); toast('Sipariş hazır'); } catch (e) { hata(e); } };
  if (q('[data-teslim]')) q('[data-teslim]').onclick = async () => {
    if (!(await onayla(`${s.firma_ad} siparişi teslim edildi olarak işaretlensin mi?`, { evet: 'Teslim edildi' }))) return;
    try { await V.durumYap(s.kod, s.id, 'teslim_edildi'); toast('Teslim edildi'); } catch (e) { hata(e); }
  };
  if (q('[data-geri]')) q('[data-geri]').onclick = async () => { try { await V.durumYap(s.kod, s.id, 'hazir'); } catch (e) { hata(e); } };
  if (q('[data-iptal]')) q('[data-iptal]').onclick = async () => {
    if (!(await onayla(`${s.firma_ad} siparişi iptal edilsin mi?`, { evet: 'İptal et', tehlikeli: true }))) return;
    try { await V.durumYap(s.kod, s.id, 'iptal'); } catch (e) { hata(e); }
  };
  if (q('[data-sil]')) q('[data-sil]').onclick = async () => {
    if (!(await onayla('Sipariş kalıcı olarak silinsin mi? Müşteri de artık göremez.', { evet: 'Sil', tehlikeli: true }))) return;
    try { await V.siparisSil(s.kod, s.id); } catch (e) { hata(e); }
  };
}

async function teklifGonder(s) {
  const tt = teklifTaslak[s.id] || {};
  const teklif = {};
  for (const i of teklifIstenenler(s)) {
    const ham = tt[i]?.fiyat ?? (s.teklif?.[i] ? String(s.teklif[i].fiyat) : '');
    const fiyat = sayiOku(ham);
    if (fiyat === null || fiyat < 0) return toast(`${i + 1}. kalem için fiyat yazın: ${s.kalemler[i].metin}`, 'hata');
    teklif[i] = { fiyat, not: (tt[i]?.not ?? s.teklif?.[i]?.not ?? '').trim() };
  }
  const toplam = Object.values(teklif).reduce((a, t) => a + t.fiyat, 0);
  if (!(await onayla(`${s.firma_ad} firmasına teklif gönderilsin mi?\nToplam: ${TL(toplam)}`, { evet: 'Gönder' }))) return;
  try {
    await V.teklifGonder(s.kod, s.id, teklif);
    if (!s.alan) await V.siparisAl(s.kod, s.id, BEN);
    delete teklifTaslak[s.id];
  } catch (e) { return toast(hataMesaji(e), 'hata'); }
  const f = firmaBul(s.fid);
  if (f?.telefon) {
    const m = modalAc(`<h3>Teklif gönderildi ✅</h3><p class="muted">Müşteri sipariş sayfasında görecek. İsterseniz WhatsApp'tan da haber verin.</p>
      <div class="btns" style="flex-direction:column"><a class="btn block" style="text-align:center;text-decoration:none;background:#25d366;color:#fff" target="_blank" rel="noopener"
      href="${esc(wpLinki(f.telefon, `Merhaba${f.yetkili ? ' ' + f.yetkili : ''}, siparişiniz için fiyat teklifimiz hazır. Onaylamak için: ${linkOlustur(f.kod)}`))}">WhatsApp'tan haber ver</a>
      <button class="btn ghost block" id="tm">Tamam</button></div>`);
    m.querySelector('#tm').onclick = modalKapat;
  } else toast('Teklif gönderildi');
}

// ---------- Elle sipariş ----------
function elleSiparisAc() {
  if (!firmalar.length) return toast('Önce Firmalar bölümünden firma ekleyin');
  const s = modalAc(`<h3>WhatsApp'tan gelen sipariş</h3>
    <label class="l">Firma</label><select id="eFirma">${firmalar.map(f => `<option value="${f.id}">${esc(f.ad)}</option>`).join('')}</select>
    <label class="l">Mesajı yapıştırın (her satır bir kalem)</label><textarea id="eMetin" rows="7"></textarea>
    <div id="eOnizleme"></div>
    <label class="l">Not</label><input id="eNot">
    <div class="btns"><button class="btn ghost" id="vz">Vazgeç</button><button class="btn" id="kaydet">Kaydet</button></div>`);
  const teklif = new Set();
  const onizle = () => {
    const l = satirlariAyir($('eMetin').value);
    $('eOnizleme').innerHTML = l.length ? `<p class="muted" style="margin:10px 0 0">${l.length} kalem. Fiyat sorulanları işaretleyin:</p>` + l.map((m, i) =>
      `<label class="kalem" style="cursor:pointer"><input type="checkbox" data-i="${i}" ${teklif.has(i) ? 'checked' : ''} style="width:22px;height:22px;accent-color:#b45309"><span class="m">${esc(m)}</span></label>`).join('') : '';
    $('eOnizleme').querySelectorAll('[data-i]').forEach(c => c.onchange = () => { c.checked ? teklif.add(+c.dataset.i) : teklif.delete(+c.dataset.i); });
  };
  $('eMetin').oninput = () => { teklif.clear(); onizle(); };
  s.querySelector('#vz').onclick = modalKapat;
  s.querySelector('#kaydet').onclick = async () => {
    const l = satirlariAyir($('eMetin').value);
    if (!l.length) return toast('Kalem yok');
    try {
      await V.elleSiparis($('eFirma').value, l.map((m, i) => kalemOlustur(m, teklif.has(i))), $('eNot').value.trim(), BEN);
      modalKapat(); toast('Sipariş kaydedildi');
    } catch (e) { toast(hataMesaji(e), 'hata'); }
  };
}

// ---------- Firmalar ----------
function firmalarCiz() {
  const acik = fid => siparisler.filter(s => s.fid === fid && !['teslim_edildi', 'iptal'].includes(s.durum)).length;
  $('app').innerHTML = `<button class="btn block" id="firmaEkle">+ Firma ekle</button><div style="height:12px"></div>` +
    (firmalar.length ? `<div class="card">${firmalar.map(f => `<div class="urun" data-id="${f.id}"><div><b>${esc(f.ad)}</b><div class="muted">${esc([f.yetkili, f.telefon].filter(Boolean).join(' · ') || 'İletişim bilgisi yok')}</div></div>
      <div style="text-align:right">${f.link_aktif === false ? '<span class="tag d-iptal">Link kapalı</span>' : '<span class="tag d-onaylandi">Link açık</span>'}${acik(f.id) ? `<div class="muted">${acik(f.id)} açık sipariş</div>` : ''}</div></div>`).join('')}</div>`
      : '<div class="empty">Henüz firma yok. Firma ekleyince ona özel sipariş linki oluşur.</div>');
  $('firmaEkle').onclick = () => firmaFormu();
  $('app').querySelectorAll('.urun').forEach(d => d.onclick = () => firmaFormu(firmaBul(d.dataset.id)));
}

function firmaFormu(f = null) {
  const link = f ? linkOlustur(f.kod) : '';
  const s = modalAc(`<h3>${f ? esc(f.ad) : 'Yeni firma'}</h3>
    <label class="l">Firma adı</label><input id="fAd" value="${esc(f?.ad || '')}">
    <label class="l">Yetkili</label><input id="fYetkili" value="${esc(f?.yetkili || '')}">
    <label class="l">Telefon (WhatsApp)</label><input id="fTel" inputmode="tel" value="${esc(f?.telefon || '')}" placeholder="05xx xxx xx xx">
    <div class="btns"><button class="btn ghost" id="vz">Vazgeç</button><button class="btn" id="kaydet">Kaydet</button></div>
    ${f ? `<h2>Sipariş linki ${f.link_aktif === false ? '<span class="tag d-iptal">Kapalı</span>' : ''}</h2>
      <div class="link-kutu">${esc(link)}</div>
      <div class="btns">
        <button class="btn ghost kucuk" id="kopya">Kopyala</button>
        ${f.telefon ? `<a class="btn kucuk" style="text-align:center;text-decoration:none;background:#25d366;color:#fff" target="_blank" rel="noopener" href="${esc(wpLinki(f.telefon, `Merhaba${f.yetkili ? ' ' + f.yetkili : ''}, ${ayar.isletme_ad ? ayar.isletme_ad + ' ' : ''}sipariş sayfanız hazır. Siparişlerinizi buradan verebilir, fiyat teklifi isteyebilirsiniz. Telefonunuzda "Ana ekrana ekle" ile kaydedebilirsiniz:\n${link}`))}">WhatsApp'la gönder</a>` : ''}
        <a class="btn ghost kucuk" style="text-align:center;text-decoration:none" target="_blank" rel="noopener" href="${esc(link)}${location.search.includes('emu') ? '&emu=1' : ''}">Aç</a>
      </div>
      <div class="btns">
        <button class="btn ghost kucuk" id="yenile">Linki yenile</button>
        <button class="btn ${f.link_aktif === false ? '' : 'danger'} kucuk" id="acKapa">${f.link_aktif === false ? 'Linki aç' : 'Linki kapat'}</button>
        <button class="btn danger kucuk" id="sil">Firmayı sil</button>
      </div>
      <p class="muted">Linki yenilerseniz eski link çalışmaz; firmaya yenisini göndermeniz gerekir. Siparişler korunur.</p>` : ''}`);
  s.querySelector('#vz').onclick = modalKapat;
  s.querySelector('#kaydet').onclick = async () => {
    const ad = $('fAd').value.trim();
    if (!ad) return toast('Firma adı yazın');
    try {
      const id = await V.firmaKaydet({ id: f?.id, ad, yetkili: $('fYetkili').value.trim(), telefon: $('fTel').value.trim() });
      toast('Kaydedildi');
      if (!f) setTimeout(() => { const y = firmaBul(id); if (y) firmaFormu(y); else modalKapat(); }, 400);
      else modalKapat();
    } catch (e) { toast(hataMesaji(e), 'hata'); }
  };
  if (!f) return;
  s.querySelector('#kopya').onclick = () => (navigator.clipboard?.writeText(link) || Promise.reject()).then(() => toast('Link kopyalandı'), () => toast('Kopyalanamadı, elle seçin'));
  s.querySelector('#yenile').onclick = async () => {
    if (!(await onayla('Yeni link oluşturulsun mu? Eski link hemen çalışmaz hale gelir.', { evet: 'Yenile', tehlikeli: true }))) return;
    try { await V.linkYenile(f.id); toast('Yeni link oluşturuldu'); setTimeout(() => firmaFormu(firmaBul(f.id)), 400); } catch (e) { toast(hataMesaji(e), 'hata'); }
  };
  s.querySelector('#acKapa').onclick = async () => {
    try {
      if (f.link_aktif === false) await V.linkAc(f.id); else await V.linkKapat(f.id);
      setTimeout(() => firmaFormu(firmaBul(f.id)), 300);
    } catch (e) { toast(hataMesaji(e), 'hata'); }
  };
  s.querySelector('#sil').onclick = async () => {
    if (!(await onayla(`${f.ad} silinsin mi?`, { evet: 'Sil', tehlikeli: true }))) return;
    try { await V.firmaSil(f.id); modalKapat(); toast('Firma silindi'); } catch (e) { toast(hataMesaji(e), 'hata'); }
  };
}

// ---------- Katalog ----------
const BIRIMLER = ['adet', 'kutu', 'paket', 'takım', 'metre', 'kg'];

function katalogCiz() {
  const tumu = katalogSorgu ? katalogAra(katalog.map(u => ({ ...u, _aktif: u.aktif, aktif: true })), katalogSorgu) : katalog.map(u => ({ ...u, _aktif: u.aktif }));
  $('app').innerHTML = `<button class="btn block" id="urunEkle">+ Ürün ekle</button>
    <input id="kAra" type="search" placeholder="Katalogda ara…" value="${esc(katalogSorgu)}" style="margin:12px 0">
    <p class="muted">Müşteri sipariş verirken bu listeden seçebilir. Fiyat burada görünmez; fiyat teklif ile verilir.</p>
    ${tumu.length ? `<div class="card">${tumu.map(u => `<div class="urun" data-id="${u.id}"><div><div>${esc(u.ad)}</div><div class="muted">${esc([u.kategori, u.birim].filter(Boolean).join(' · '))}</div></div>${u._aktif === false ? '<span class="tag">Pasif</span>' : ''}</div>`).join('')}</div>`
      : `<div class="empty">${katalog.length ? 'Bulunamadı.' : 'Katalog boş. Sık istenen ürünleri ekleyin.'}</div>`}`;
  $('urunEkle').onclick = () => urunFormu();
  $('kAra').oninput = e => { katalogSorgu = e.target.value; const p = e.target.selectionStart; katalogCiz(); const a = $('kAra'); a.focus(); a.setSelectionRange(p, p); };
  $('app').querySelectorAll('.urun').forEach(d => d.onclick = () => urunFormu(katalog.find(u => u.id === d.dataset.id)));
}

function urunFormu(u = null) {
  const kategoriler = [...new Set(katalog.map(x => x.kategori).filter(Boolean))];
  const s = modalAc(`<h3>${u ? 'Ürünü düzenle' : 'Yeni ürün'}</h3>
    <label class="l">Ürün adı</label><input id="uAd" value="${esc(u?.ad || '')}" placeholder="örn. 10 düz freze h100">
    <label class="l">Birim</label><input id="uBirim" list="birimler" value="${esc(u?.birim || 'adet')}">
    <datalist id="birimler">${BIRIMLER.map(b => `<option value="${b}">`).join('')}</datalist>
    <label class="l">Kategori (isteğe bağlı)</label><input id="uKat" list="kategoriler" value="${esc(u?.kategori || '')}">
    <datalist id="kategoriler">${kategoriler.map(k => `<option value="${esc(k)}">`).join('')}</datalist>
    <label class="fiyat-iste" style="flex-direction:row;width:auto;gap:8px;margin-top:14px;font-size:14px"><input type="checkbox" id="uAktif" ${u?.aktif === false ? '' : 'checked'}>Müşteriye göster</label>
    <div class="btns">${u ? '<button class="btn danger" id="sil">Sil</button>' : ''}<button class="btn ghost" id="vz">Vazgeç</button><button class="btn" id="kaydet">Kaydet</button></div>`);
  setTimeout(() => { if (!u) $('uAd').focus(); }, 100);
  s.querySelector('#vz').onclick = modalKapat;
  s.querySelector('#kaydet').onclick = async () => {
    const ad = $('uAd').value.trim();
    if (!ad) return toast('Ürün adı yazın');
    try {
      await V.katalogKaydet({ id: u?.id, ad, birim: $('uBirim').value.trim() || 'adet', kategori: $('uKat').value.trim(), aktif: $('uAktif').checked });
      modalKapat(); toast('Kaydedildi');
    } catch (e) { toast(hataMesaji(e), 'hata'); }
  };
  if (u) s.querySelector('#sil').onclick = async () => {
    if (!(await onayla(`"${u.ad}" katalogdan silinsin mi?`, { evet: 'Sil', tehlikeli: true }))) return;
    try { await V.katalogSil(u.id); modalKapat(); } catch (e) { toast(hataMesaji(e), 'hata'); }
  };
}

// ---------- Ayarlar ----------
function ayarlarAc() {
  const s = modalAc(`<h3>Ayarlar</h3>
    <label class="l">İşletme adı (müşteri sayfasında görünür)</label><input id="aAd" value="${esc(ayar.isletme_ad || '')}">
    <label class="l">WhatsApp numarası (müşteri "haber ver" deyince buraya yazar)</label><input id="aWp" inputmode="tel" value="${esc(ayar.wp_numara || '')}" placeholder="05xx xxx xx xx">
    <label class="l">Telefon bildirimi konusu (ntfy)</label>
    <div class="row" style="gap:6px"><input id="aNtfy" value="${esc(ayar.ntfy_konu || '')}" autocapitalize="off" style="font-family:monospace"><button class="btn ghost kucuk" id="olustur">Oluştur</button></div>
    <p class="muted">Uygulama kapalıyken de bildirim almak için: telefona ücretsiz <b>ntfy</b> uygulamasını kurun, “+” ile bu konuya abone olun. İkiniz de aynı konuya abone olursanız ikinize de bildirim gelir.</p>
    <div class="btns"><button class="btn ghost kucuk" id="test">Test bildirimi gönder</button></div>
    <div class="btns"><button class="btn" id="kaydet">Kaydet</button></div>
    <h2>Kullanıcılar</h2><div id="kullanicilar" class="card" style="padding:4px 14px"><div class="muted" style="padding:10px 0">Yükleniyor…</div></div>
    <div class="btns"><button class="btn ghost kucuk" id="kEkle">+ Kullanıcı ekle</button></div>
    <h2>Hesabım</h2><div class="muted">${esc(BEN.ad)} · ${esc(AUTH.currentUser?.email || '')}</div>
    <div class="btns"><button class="btn ghost kucuk" id="sifre">Şifremi değiştir</button><button class="btn ghost kucuk" id="adim">Adımı değiştir</button></div>
    <div class="btns"><button class="btn ghost" id="cikis">Çıkış yap</button><button class="btn ghost" id="kapat">Kapat</button></div>`);
  const kapatK = V.yoneticileriDinle(l => {
    const kutu = $('kullanicilar'); if (!kutu) return kapatK();
    kutu.innerHTML = l.map(y => `<div class="urun" style="cursor:default"><div><div>${esc(y.ad || '—')}${y.id === BEN.uid ? ' <span class="tag">Siz</span>' : ''}</div><div class="muted">${esc(y.eposta || '')}</div></div>
      ${y.id === BEN.uid ? '' : `<button class="btn danger kucuk" data-ksil="${y.id}">Çıkar</button>`}</div>`).join('');
    kutu.querySelectorAll('[data-ksil]').forEach(b => b.onclick = async () => {
      const y = l.find(x => x.id === b.dataset.ksil);
      if (!(await onayla(`${y.ad} artık sisteme giremesin mi?`, { evet: 'Çıkar', tehlikeli: true }))) return ayarlarAc();
      try { await V.yoneticiSil(y.id); toast('Kullanıcı çıkarıldı'); } catch (e) { toast(hataMesaji(e), 'hata'); }
      ayarlarAc();
    });
  });
  s.querySelector('#kEkle').onclick = () => { kapatK(); kullaniciEkleAc(); };
  s.querySelector('#sifre').onclick = () => { kapatK(); sifreDegistirAc(); };
  s.querySelector('#adim').onclick = async () => {
    const ad = prompt('Adınız (siparişlerde "kimde" olarak görünür):', BEN.ad);
    if (!ad || !ad.trim()) return;
    try { await V.yoneticiAdDegistir(BEN.uid, ad); BEN.ad = ad.trim(); $('altBaslik').textContent = BEN.ad; toast('Adınız güncellendi'); ayarlarAc(); } catch (e) { toast(hataMesaji(e), 'hata'); }
  };
  s.querySelector('#olustur').onclick = () => { $('aNtfy').value = 'takimci-' + kodUret(12).toLowerCase(); };
  s.querySelector('#test').onclick = async () => {
    const k = $('aNtfy').value.trim();
    if (!k) return toast('Önce konu oluşturun');
    await ntfyGonder(k, 'Test bildirimi', 'Sipariş bildirimleri çalışıyor.');
    toast('Gönderildi, telefonunuza bakın');
  };
  s.querySelector('#kaydet').onclick = async () => {
    const yeni = { isletme_ad: $('aAd').value.trim(), wp_numara: $('aWp').value.trim(), ntfy_konu: $('aNtfy').value.trim() };
    try { await V.ayarKaydet(yeni); ayar = yeni; modalKapat(); toast('Ayarlar kaydedildi'); } catch (e) { toast(hataMesaji(e), 'hata'); }
  };
  s.querySelector('#cikis').onclick = async () => { kapatK(); modalKapat(); await FA.signOut(AUTH); };
  s.querySelector('#kapat').onclick = () => { kapatK(); modalKapat(); };
}

function kullaniciEkleAc() {
  const s = modalAc(`<h3>Kullanıcı ekle</h3>
    <p class="muted">Eklediğiniz kişi bu e-posta ve şifreyle girip siparişleri yönetebilir.</p>
    <label class="l">Adı</label><input id="kAd" placeholder="örn. Ahmet">
    <label class="l">E-posta</label><input id="kEp" type="email" autocapitalize="off">
    <label class="l">Başlangıç şifresi (en az 6 karakter)</label><input id="kSf" value="${kodUret(10)}" autocapitalize="off" style="font-family:monospace">
    <div class="btns"><button class="btn ghost" id="vz">Vazgeç</button><button class="btn" id="ekle">Ekle</button></div>`);
  s.querySelector('#vz').onclick = ayarlarAc;
  s.querySelector('#ekle').onclick = async () => {
    const ad = $('kAd').value.trim(), ep = $('kEp').value.trim(), sf = $('kSf').value;
    if (!ad || !ep) return toast('Ad ve e-posta yazın');
    if (sf.length < 6) return toast('Şifre en az 6 karakter olmalı');
    const b = s.querySelector('#ekle'); b.disabled = true;
    try {
      await V.yoneticiEkle(ep, sf, ad);
      const m = modalAc(`<h3>${esc(ad)} eklendi ✅</h3><p>Bu bilgileri kendisine iletin:</p>
        <div class="link-kutu">Adres: ${esc(location.origin + location.pathname)}<br>E-posta: ${esc(ep)}<br>Şifre: ${esc(sf)}</div>
        <p class="muted">Girdikten sonra Ayarlar → Şifremi değiştir ile kendi şifresini belirleyebilir.</p>
        <div class="btns"><button class="btn" id="tm">Tamam</button></div>`);
      m.querySelector('#tm').onclick = ayarlarAc;
    } catch (e) {
      b.disabled = false;
      toast(e?.code === 'auth/email-already-in-use' ? 'Bu e-posta zaten kayıtlı.' : e?.code === 'auth/invalid-email' ? 'E-posta geçersiz.' : hataMesaji(e), 'hata');
    }
  };
}

function sifreDegistirAc() {
  const s = modalAc(`<h3>Şifremi değiştir</h3>
    <label class="l">Şu anki şifre</label><input id="sEski" type="password" autocomplete="current-password">
    <label class="l">Yeni şifre (en az 6 karakter)</label><input id="sYeni" type="password" autocomplete="new-password">
    <div class="btns"><button class="btn ghost" id="vz">Vazgeç</button><button class="btn" id="kaydet">Değiştir</button></div>`);
  s.querySelector('#vz').onclick = ayarlarAc;
  s.querySelector('#kaydet').onclick = async () => {
    const yeni = $('sYeni').value;
    if (yeni.length < 6) return toast('Yeni şifre en az 6 karakter olmalı');
    try {
      const u = AUTH.currentUser;
      await FA.reauthenticateWithCredential(u, FA.EmailAuthProvider.credential(u.email, $('sEski').value));
      await FA.updatePassword(u, yeni);
      modalKapat(); toast('Şifreniz değiştirildi');
    } catch (e) { toast(hataMesaji(e), 'hata'); }
  };
}
