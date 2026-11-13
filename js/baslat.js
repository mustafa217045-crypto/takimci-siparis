// Tarayıcı girişi: Firebase SDK'yı CDN'den yükler ve veri katmanını kurar.
import { initializeApp, deleteApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import * as fs from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import * as fa from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import { firebaseConfig } from './firebase-ayar.js';
import { veriOlustur } from './veri.js';

export function baslat({ emulator = false } = {}) {
  const ayar = emulator ? { ...firebaseConfig, projectId: 'demo-takimci', apiKey: 'demo-key' } : firebaseConfig;
  const app = initializeApp(ayar);
  let db;
  try {
    db = fs.initializeFirestore(app, { localCache: fs.persistentLocalCache({ tabManager: fs.persistentMultipleTabManager() }) });
  } catch {
    db = fs.getFirestore(app);
  }
  const auth = fa.getAuth(app);
  if (emulator) {
    fs.connectFirestoreEmulator(db, location.hostname, 8080);
    fa.connectAuthEmulator(auth, `http://${location.hostname}:9099`, { disableWarnings: true });
  }
  // Yeni kullanıcıyı ayrı bir uygulama örneğinde açar; ekleyen kişinin oturumu değişmez.
  async function hesapOlustur(eposta, sifre) {
    const ikincil = initializeApp(ayar, 'ikincil-' + Date.now());
    const a = fa.getAuth(ikincil);
    if (emulator) fa.connectAuthEmulator(a, `http://${location.hostname}:9099`, { disableWarnings: true });
    try { return (await fa.createUserWithEmailAndPassword(a, eposta, sifre)).user.uid; }
    finally { await deleteApp(ikincil); }
  }
  return { veri: veriOlustur(fs, db, auth, { hesapOlustur }), auth, fa };
}
