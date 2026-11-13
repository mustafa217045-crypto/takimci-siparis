// Ortak arayüz yardımcıları
export const $ = id => document.getElementById(id);

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const TL = n => new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 2 }).format(n || 0);

export function sayiOku(s) {
  s = String(s ?? '').trim().replace(/\s|₺|TL/gi, '');
  if (!s) return null;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  const n = parseFloat(s);
  return isNaN(n) ? null : Math.round(n * 100) / 100;
}

export function tarihSaat(t) {
  const d = t?.toDate ? t.toDate() : (t instanceof Date ? t : null);
  if (!d) return 'şimdi';
  const bugun = new Date(); const dun = new Date(Date.now() - 864e5);
  const saat = d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === bugun.toDateString()) return 'Bugün ' + saat;
  if (d.toDateString() === dun.toDateString()) return 'Dün ' + saat;
  return d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ' ' + saat;
}

export function toast(m, tip = '') {
  const t = $('toast');
  t.textContent = m; t.className = 'toast show ' + tip;
  clearTimeout(toast.z); toast.z = setTimeout(() => t.classList.remove('show'), 2600);
}

export function modalAc(html, { genis = false } = {}) {
  $('sheet').innerHTML = html;
  $('sheet').classList.toggle('genis', genis);
  $('modal').classList.add('open');
  return $('sheet');
}
export function modalKapat() { $('modal').classList.remove('open'); }

export function onayla(mesaj, { evet = 'Evet', hayir = 'Vazgeç', tehlikeli = false } = {}) {
  return new Promise(coz => {
    const s = modalAc(`<p class="onay-metni">${esc(mesaj).replace(/\n/g, '<br>')}</p>
      <div class="btns"><button class="btn ghost" data-c="0">${esc(hayir)}</button><button class="btn ${tehlikeli ? 'danger' : ''}" data-c="1">${esc(evet)}</button></div>`);
    s.querySelectorAll('[data-c]').forEach(b => b.onclick = () => { modalKapat(); coz(b.dataset.c === '1'); });
  });
}

export function durumEtiketi(durum, ad) {
  return `<span class="tag d-${durum}">${esc(ad)}</span>`;
}

export function hataMesaji(e) {
  const k = e?.code || '';
  if (k.includes('permission-denied')) return 'Bu işlem için yetkiniz yok ya da bağlantı geçersiz.';
  if (k.includes('unavailable') || !navigator.onLine) return 'İnternet bağlantısı yok. Bağlanınca tekrar deneyin.';
  if (k.includes('invalid-credential') || k.includes('wrong-password') || k.includes('user-not-found')) return 'E-posta ya da şifre hatalı.';
  if (k.includes('too-many-requests')) return 'Çok fazla deneme. Biraz bekleyip tekrar deneyin.';
  return e?.message || 'Bir hata oluştu.';
}

export function bip() {
  try {
    const c = new (window.AudioContext || window.webkitAudioContext)();
    [0, 0.18].forEach(t => {
      const o = c.createOscillator(), g = c.createGain();
      o.frequency.value = 880; o.connect(g); g.connect(c.destination);
      g.gain.setValueAtTime(0.2, c.currentTime + t); g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + t + 0.15);
      o.start(c.currentTime + t); o.stop(c.currentTime + t + 0.16);
    });
  } catch { /* ses desteklenmiyor */ }
}

export const depo = {
  al(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  koy(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* yok say */ } },
  sil(k) { try { localStorage.removeItem(k); } catch { /* yok say */ } }
};
