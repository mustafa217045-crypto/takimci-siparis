// Veri katmanı. Firebase SDK fonksiyonları dışarıdan verilir (tarayıcıda CDN, testte npm paketi).
import { ilkDurum, kararSonrasiDurum, kodUret, hazirMi } from './mantik.js';

export function veriOlustur(sdk, db, auth, { hesapOlustur } = {}) {
  const {
    doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, collection, collectionGroup, onSnapshot,
    serverTimestamp, runTransaction, writeBatch, query, where
  } = sdk;

  const portalRef = kod => doc(db, 'portal', kod);
  const sipKol = kod => collection(db, 'portal', kod, 'siparisler');
  const sipRef = (kod, sid) => doc(db, 'portal', kod, 'siparisler', sid);
  const kimlikli = s => ({ id: s.id, ...s.data() });

  // ---------- Müşteri ----------
  async function portalGetir(kod) {
    if (!kod) return null;
    const s = await getDoc(portalRef(kod));
    return s.exists() ? { kod, ...s.data() } : null;
  }

  function siparisleriDinle(kod, cb, hata) {
    return onSnapshot(sipKol(kod), snap => {
      cb(snap.docs.map(kimlikli).sort(yeniOnce));
    }, hata);
  }

  async function siparisVer(kod, portal, kalemler, not = '') {
    if (!kalemler.length) throw new Error('En az bir kalem gerekli');
    const ref = doc(sipKol(kod));
    await setDoc(ref, {
      fid: portal.fid, firma_ad: portal.firma_ad, kod, not: String(not || ''), kaynak: 'musteri',
      olusturma: serverTimestamp(), guncelleme: serverTimestamp(),
      kalemler, durum: ilkDurum(kalemler), teklif: {}, kararlar: {}, hazirlik: {}, alan: null
    });
    return ref.id;
  }

  async function kararGonder(kod, sid, kararlar) {
    const s = await getDoc(sipRef(kod, sid));
    const durum = kararSonrasiDurum(s.data(), kararlar);
    await updateDoc(sipRef(kod, sid), { kararlar, durum, guncelleme: serverTimestamp() });
    return durum;
  }

  async function siparisIptal(kod, sid) {
    await updateDoc(sipRef(kod, sid), { durum: 'iptal', guncelleme: serverTimestamp() });
  }

  async function katalogGetir() {
    const s = await getDocs(collection(db, 'katalog'));
    return s.docs.map(kimlikli).sort((a, b) => a.ad.localeCompare(b.ad, 'tr'));
  }

  // ---------- Yönetici ----------
  async function yoneticiMi(uid) {
    try {
      const s = await getDoc(doc(db, 'yoneticiler', uid));
      return s.exists() ? { uid, ...s.data() } : null;
    } catch { return null; }
  }

  function tumSiparisleriDinle(cb, hata) {
    return onSnapshot(collectionGroup(db, 'siparisler'), snap => {
      cb(snap.docs.map(kimlikli).sort(yeniOnce), snap.docChanges().map(d => ({ tip: d.type, id: d.doc.id })));
    }, hata);
  }

  async function siparisAl(kod, sid, ben, devral = false) {
    return runTransaction(db, async tx => {
      const s = await tx.get(sipRef(kod, sid));
      const alan = s.data().alan;
      if (alan && alan.uid !== ben.uid && !devral) return { ok: false, alan };
      tx.update(sipRef(kod, sid), { alan: { uid: ben.uid, ad: ben.ad }, guncelleme: serverTimestamp() });
      return { ok: true };
    });
  }

  async function birak(kod, sid) {
    await updateDoc(sipRef(kod, sid), { alan: null, guncelleme: serverTimestamp() });
  }

  async function teklifKaydet(kod, sid, teklif) {
    await updateDoc(sipRef(kod, sid), { teklif, guncelleme: serverTimestamp() });
  }

  async function teklifGonder(kod, sid, teklif) {
    await updateDoc(sipRef(kod, sid), { teklif, durum: 'teklif_gonderildi', guncelleme: serverTimestamp() });
  }

  async function kalemTikle(kod, sid, i, isaret, ben) {
    return runTransaction(db, async tx => {
      const s = (await tx.get(sipRef(kod, sid))).data();
      const hazirlik = { ...(s.hazirlik || {}) };
      if (isaret) hazirlik[i] = { kim: ben.ad, zaman: Date.now() }; else delete hazirlik[i];
      const ek = {};
      if (s.durum === 'onaylandi' && isaret) ek.durum = 'hazirlaniyor';
      if (s.durum === 'hazir' && !isaret) ek.durum = 'hazirlaniyor';
      if (!s.alan) ek.alan = { uid: ben.uid, ad: ben.ad };
      tx.update(sipRef(kod, sid), { hazirlik, ...ek, guncelleme: serverTimestamp() });
    });
  }

  async function durumYap(kod, sid, durum) {
    if (durum === 'hazir') {
      const s = (await getDoc(sipRef(kod, sid))).data();
      if (!hazirMi(s)) throw new Error('Tüm kalemler hazırlanmadan sipariş hazır olamaz');
    }
    await updateDoc(sipRef(kod, sid), { durum, guncelleme: serverTimestamp() });
  }

  async function elleSiparis(fid, kalemler, not = '', ben = null) {
    const f = (await getDoc(doc(db, 'firmalar', fid))).data();
    const ref = doc(sipKol(f.kod));
    await setDoc(ref, {
      fid, firma_ad: f.ad, kod: f.kod, not: String(not || ''), kaynak: 'yonetici',
      olusturma: serverTimestamp(), guncelleme: serverTimestamp(),
      kalemler, durum: ilkDurum(kalemler), teklif: {}, kararlar: {}, hazirlik: {},
      alan: ben ? { uid: ben.uid, ad: ben.ad } : null
    });
    return ref.id;
  }

  async function siparisSil(kod, sid) { await deleteDoc(sipRef(kod, sid)); }

  // ---------- Firmalar ----------
  function firmalariDinle(cb) {
    return onSnapshot(collection(db, 'firmalar'), s => cb(s.docs.map(kimlikli).sort((a, b) => a.ad.localeCompare(b.ad, 'tr'))));
  }

  async function portalVerisi(f, aktif = true) {
    const a = await ayarGetir();
    return { fid: f.id, firma_ad: f.ad, aktif, isletme_ad: a.isletme_ad || '', wp_numara: a.wp_numara || '', ntfy_konu: a.ntfy_konu || '' };
  }

  async function firmaKaydet(firma) {
    const veri = { ad: firma.ad.trim(), telefon: firma.telefon || '', yetkili: firma.yetkili || '' };
    if (firma.id) {
      const eski = (await getDoc(doc(db, 'firmalar', firma.id))).data();
      await updateDoc(doc(db, 'firmalar', firma.id), veri);
      if (eski.kod && eski.ad !== veri.ad) await updateDoc(portalRef(eski.kod), { firma_ad: veri.ad });
      return firma.id;
    }
    const ref = doc(collection(db, 'firmalar'));
    const kod = kodUret();
    await setDoc(portalRef(kod), await portalVerisi({ id: ref.id, ...veri }));
    await setDoc(ref, { ...veri, kod, link_aktif: true, olusturma: serverTimestamp() });
    return ref.id;
  }

  async function linkAktif(fid, aktif) {
    const f = (await getDoc(doc(db, 'firmalar', fid))).data();
    await updateDoc(portalRef(f.kod), { aktif });
    await updateDoc(doc(db, 'firmalar', fid), { link_aktif: aktif });
  }
  const linkKapat = fid => linkAktif(fid, false);
  const linkAc = fid => linkAktif(fid, true);

  async function linkYenile(fid) {
    const fRef = doc(db, 'firmalar', fid);
    const f = (await getDoc(fRef)).data();
    const eski = f.kod, yeni = kodUret();
    const eskiPortal = (await getDoc(portalRef(eski))).data() || {};
    const siparisler = await getDocs(sipKol(eski));
    const batch = writeBatch(db);
    batch.set(portalRef(yeni), { ...(await portalVerisi({ id: fid, ...f })), aktif: eskiPortal.aktif !== false });
    siparisler.forEach(s => {
      batch.set(sipRef(yeni, s.id), { ...s.data(), kod: yeni });
      batch.delete(s.ref);
    });
    batch.delete(portalRef(eski));
    batch.update(fRef, { kod: yeni });
    await batch.commit();
    return yeni;
  }

  async function firmaSil(fid) {
    const f = (await getDoc(doc(db, 'firmalar', fid))).data();
    const sipler = await getDocs(sipKol(f.kod));
    if (!sipler.empty) throw new Error('Bu firmanın siparişleri var; önce linki kapatın.');
    await deleteDoc(portalRef(f.kod));
    await deleteDoc(doc(db, 'firmalar', fid));
  }

  // ---------- Katalog ----------
  function katalogDinle(cb) {
    return onSnapshot(collection(db, 'katalog'), s => cb(s.docs.map(kimlikli).sort((a, b) => a.ad.localeCompare(b.ad, 'tr'))));
  }
  async function katalogKaydet(urun) {
    const veri = { ad: urun.ad.trim(), birim: urun.birim || 'adet', kategori: urun.kategori || '', aktif: urun.aktif !== false };
    const ref = urun.id ? doc(db, 'katalog', urun.id) : doc(collection(db, 'katalog'));
    await setDoc(ref, veri);
    return ref.id;
  }
  async function katalogSil(id) { await deleteDoc(doc(db, 'katalog', id)); }

  // ---------- Ayarlar ----------
  async function ayarGetir() {
    const s = await getDoc(doc(db, 'ayarlar', 'genel'));
    return s.exists() ? s.data() : {};
  }
  async function ayarKaydet(ayar) {
    const veri = { isletme_ad: ayar.isletme_ad || '', wp_numara: ayar.wp_numara || '', ntfy_konu: ayar.ntfy_konu || '' };
    await setDoc(doc(db, 'ayarlar', 'genel'), veri);
    const portallar = await getDocs(collection(db, 'portal'));
    const batch = writeBatch(db);
    portallar.forEach(p => batch.update(p.ref, veri));
    await batch.commit();
  }

  // ---------- Kullanıcılar (yöneticiler) ----------
  function yoneticileriDinle(cb) {
    return onSnapshot(collection(db, 'yoneticiler'), s => cb(s.docs.map(kimlikli).sort((a, b) => (a.ad || '').localeCompare(b.ad || '', 'tr'))));
  }
  async function yoneticiEkle(eposta, sifre, ad) {
    if (!hesapOlustur) throw new Error('Hesap oluşturma desteklenmiyor');
    const uid = await hesapOlustur(eposta.trim(), sifre);
    await setDoc(doc(db, 'yoneticiler', uid), { ad: ad.trim(), eposta: eposta.trim() });
    return uid;
  }
  async function yoneticiSil(uid) { await deleteDoc(doc(db, 'yoneticiler', uid)); }
  async function yoneticiAdDegistir(uid, ad) { await updateDoc(doc(db, 'yoneticiler', uid), { ad: ad.trim() }); }

  return {
    yoneticileriDinle, yoneticiEkle, yoneticiSil, yoneticiAdDegistir,
    portalGetir, siparisleriDinle, siparisVer, kararGonder, siparisIptal, katalogGetir,
    yoneticiMi, tumSiparisleriDinle, siparisAl, birak, teklifKaydet, teklifGonder, kalemTikle, durumYap,
    elleSiparis, siparisSil, firmalariDinle, firmaKaydet, linkKapat, linkAc, linkYenile, firmaSil,
    katalogDinle, katalogKaydet, katalogSil, ayarGetir, ayarKaydet
  };
}

function zamanDegeri(t) { return t?.toMillis ? t.toMillis() : (t instanceof Date ? t.getTime() : Date.now() + 1e6); }
function yeniOnce(a, b) { return zamanDegeri(b.olusturma) - zamanDegeri(a.olusturma); }

export async function ntfyGonder(konu, baslik, metin) {
  if (!konu) return;
  try {
    await fetch('https://ntfy.sh/' + encodeURIComponent(konu), {
      method: 'POST', body: metin, headers: { Title: encodeURIComponent(baslik).length === baslik.length ? baslik : '=?UTF-8?B?' + btoa(unescape(encodeURIComponent(baslik))) + '?=' }
    });
  } catch { /* bildirim gitmese de sipariş kaydedildi */ }
}
