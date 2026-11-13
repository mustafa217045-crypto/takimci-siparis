// Saf iş mantığı — tarayıcı ve Node'da aynı çalışır, Firebase'e bağımlı değil.

export const DURUM_ADI = {
  teklif_bekliyor: 'Teklif bekleniyor',
  teklif_gonderildi: 'Teklif geldi',
  onaylandi: 'Onaylandı',
  hazirlaniyor: 'Hazırlanıyor',
  hazir: 'Hazır',
  teslim_edildi: 'Teslim edildi',
  iptal: 'İptal'
};

const ONEK = /^(?:\d{1,3}[).]\s+|[-•*–]\s*)/;

export function satirlariAyir(metin) {
  return String(metin ?? '')
    .split(/\r?\n/)
    .map(s => s.trim().replace(ONEK, '').trim())
    .filter(Boolean);
}

export function kalemOlustur(metin, teklif = false, katalog_id = null) {
  return { metin: String(metin ?? '').trim(), teklif: !!teklif, katalog_id: katalog_id ?? null };
}

export function katalogSatiri(urun, miktar) {
  return [miktar, urun.birim, urun.ad].filter(x => x !== undefined && x !== null && x !== '').join(' ');
}

export function ilkDurum(kalemler) {
  return kalemler.some(k => k.teklif) ? 'teklif_bekliyor' : 'onaylandi';
}

export function teklifIstenenler(siparis) {
  return siparis.kalemler.map((k, i) => (k.teklif ? i : -1)).filter(i => i >= 0);
}

const GECERLI_KARAR = new Set(['onaylandi', 'cikarildi']);

export function kararlarTamam(siparis, kararlar = {}) {
  return teklifIstenenler(siparis).every(i => GECERLI_KARAR.has(kararlar[i]));
}

export function hazirlanacakKalemler(siparis) {
  const kararlar = siparis.kararlar || {};
  return siparis.kalemler
    .map((k, i) => (!k.teklif || kararlar[i] === 'onaylandi' ? i : -1))
    .filter(i => i >= 0);
}

export function kararSonrasiDurum(siparis, kararlar) {
  return hazirlanacakKalemler({ ...siparis, kararlar }).length ? 'onaylandi' : 'iptal';
}

export function hazirMi(siparis) {
  const liste = hazirlanacakKalemler(siparis), h = siparis.hazirlik || {};
  return liste.length > 0 && liste.every(i => h[i]);
}

export function musteriIptalEdebilir(siparis) {
  if (siparis.durum === 'teklif_bekliyor' || siparis.durum === 'teklif_gonderildi') return true;
  return siparis.durum === 'onaylandi' && !siparis.alan && Object.keys(siparis.hazirlik || {}).length === 0;
}

const HARFLER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

export function kodUret(uzunluk = 24) {
  const out = [];
  const buf = new Uint8Array(uzunluk * 2);
  while (out.length < uzunluk) {
    crypto.getRandomValues(buf);
    for (const b of buf) {
      if (b < 248 && out.length < uzunluk) out.push(HARFLER[b % 62]); // 248 = 62*4, eşit dağılım
    }
  }
  return out.join('');
}

export function wpMesaji(siparis, isletmeAd) {
  const satirlar = siparis.kalemler.map((k, i) => `${i + 1}. ${k.metin}${k.teklif ? ' (fiyat teklifi)' : ''}`);
  return [`Yeni sipariş – ${siparis.firma_ad}`, ...satirlar, siparis.not ? `Not: ${siparis.not}` : '', isletmeAd ? `(${isletmeAd} sipariş sayfasından)` : '']
    .filter(Boolean).join('\n');
}

export function numaraDuzelt(numara) {
  let d = String(numara ?? '').replace(/\D/g, '');
  if (d.startsWith('0')) d = d.slice(1);
  if (d.length === 10) d = '90' + d;
  return d;
}

export function wpLinki(numara, metin) {
  const n = numaraDuzelt(numara);
  return `https://wa.me/${n}?text=${encodeURIComponent(metin)}`;
}

const kucuk = s => String(s ?? '').toLocaleLowerCase('tr-TR').replace(/i̇/g, 'i');

export function katalogAra(liste, sorgu) {
  const kelimeler = kucuk(sorgu).split(/\s+/).filter(Boolean);
  return liste.filter(u => u.aktif !== false && kelimeler.every(k => kucuk(u.ad).includes(k)));
}
