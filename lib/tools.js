// أدوات خفيفة بدون مفاتيح: حاسبة، ترجمة، طقس، QR، اختصار روابط
const { UserError } = require('./errors');

async function getJson(url) {
  let res;
  try { res = await fetch(url, { headers: { 'User-Agent': 'wa-video-bot/1.0' }, signal: AbortSignal.timeout(20000) }); } catch { throw new UserError('تعذر الاتصال بالخدمة، جرب مرة ثانية.'); }
  if (!res.ok) throw new UserError('الخدمة رجّعت خطأ، جرب مرة ثانية.');
  try { return await res.json(); } catch { throw new UserError('رد غير متوقع من الخدمة.'); }
}

// ---------- حاسبة (قائمة بيضاء للرموز فقط)
function calc(input) {
  const raw = String(input || '').trim();
  if (!raw) throw new UserError('اكتب العملية، مثال:\n.احسب 5*(3+2)');
  const expr = raw
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/×/g, '*').replace(/÷/g, '/').replace(/\^/g, '**').replace(/،/g, '.');
  if (expr.length > 100 || !/^[0-9+\-*/().%\s]+$/.test(expr)) throw new UserError('عملية غير صالحة. المسموح: أرقام و + - * / ( ) % ^');
  let value;
  try { value = Function(`"use strict"; return (${expr});`)(); } catch { throw new UserError('عملية غير صالحة.'); }
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new UserError('ما قدرت أحسب هذي العملية.');
  return `${raw} = ${Math.round(value * 1e10) / 1e10}`;
}

// ---------- ترجمة (MyMemory، مجانية بحد يومي)
const hasArabic = (s) => /[\u0600-\u06FF]/.test(s);
async function translate(text, to) {
  const t = String(text || '').trim();
  if (!t) throw new UserError('اكتب النص، مثال:\n.ترجم hello\n.ترجم en مرحبا');
  if (t.length > 450) throw new UserError('النص طويل، الحد 450 حرف.');
  const from = hasArabic(t) ? 'ar' : 'en';
  const target = to || (from === 'ar' ? 'en' : 'ar');
  const j = await getJson(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(t)}&langpair=${from}|${target}`);
  const out = j?.responseData?.translatedText;
  if (!out || Number(j.responseStatus) !== 200) throw new UserError('ما قدرت أترجم، جرب كود لغة ثاني (مثال: en, ar, fr, tr).');
  return out;
}

// ---------- طقس (Open-Meteo)
function weatherText(code) {
  if (code === 0) return 'صافي ☀️';
  if (code <= 2) return 'غائم جزئياً ⛅';
  if (code === 3) return 'غائم ☁️';
  if (code === 45 || code === 48) return 'ضباب 🌫️';
  if (code >= 51 && code <= 57) return 'رذاذ 🌦️';
  if (code >= 61 && code <= 67) return 'مطر 🌧️';
  if (code >= 71 && code <= 77) return 'ثلج ❄️';
  if (code >= 80 && code <= 82) return 'زخات مطر 🌧️';
  if (code >= 95) return 'عاصفة رعدية ⛈️';
  return 'غير معروف';
}
async function weather(city) {
  const q = String(city || '').trim();
  if (!q) throw new UserError('اكتب اسم المدينة، مثال:\n.طقس الرياض');
  const geo = await getJson(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=1&language=ar`);
  const p = geo?.results?.[0];
  if (!p) throw new UserError('ما لقيت هذي المدينة.');
  const w = await getJson(`https://api.open-meteo.com/v1/forecast?latitude=${p.latitude}&longitude=${p.longitude}&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m&timezone=auto`);
  const c = w?.current;
  if (!c) throw new UserError('ما قدرت أجيب الطقس.');
  return [
    `🌍 ${p.name}${p.country ? `، ${p.country}` : ''}`,
    `${weatherText(c.weather_code)}`,
    `🌡️ ${c.temperature_2m}° (المحسوسة ${c.apparent_temperature}°)`,
    `💧 الرطوبة ${c.relative_humidity_2m}%`,
    `💨 الرياح ${c.wind_speed_10m} كم/س`,
  ].join('\n');
}

// ---------- QR (qrserver.com) -> Buffer PNG
async function qrCode(text) {
  const t = String(text || '').trim();
  if (!t) throw new UserError('اكتب النص أو الرابط، مثال:\n.qr https://example.com');
  if (t.length > 800) throw new UserError('النص طويل.');
  let res;
  try { res = await fetch(`https://api.qrserver.com/v1/create-qr-code/?size=600x600&margin=10&data=${encodeURIComponent(t)}`, { signal: AbortSignal.timeout(20000) }); } catch { throw new UserError('تعذر الاتصال بالخدمة، جرب مرة ثانية.'); }
  if (!res.ok) throw new UserError('ما قدرت أسوي QR.');
  return Buffer.from(await res.arrayBuffer());
}

// ---------- اختصار روابط (is.gd)
async function shorten(url) {
  const u = String(url || '').trim();
  if (!/^https?:\/\/\S+$/i.test(u)) throw new UserError('أرسل رابط صحيح، مثال:\n.اختصر https://example.com/long/link');
  let res;
  try { res = await fetch(`https://is.gd/create.php?format=simple&url=${encodeURIComponent(u)}`, { signal: AbortSignal.timeout(20000) }); } catch { throw new UserError('تعذر الاتصال بالخدمة، جرب مرة ثانية.'); }
  const text = (await res.text()).trim();
  if (!res.ok || !/^https?:\/\//.test(text)) throw new UserError('ما قدرت أختصر الرابط.');
  return text;
}


// ---------- أدوات إضافية
const dmy = () => {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
};
const arDigits = (s) => String(s).replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));

// مواقيت الصلاة (Aladhan)
async function prayer(city) {
  const q = String(city || '').trim();
  if (!q) throw new UserError('اكتب المدينة، مثال:\n.صلاة الرياض');
  const j = await getJson(`https://api.aladhan.com/v1/timingsByAddress/${dmy()}?address=${encodeURIComponent(q)}`);
  const t = j?.data?.timings;
  if (!t) throw new UserError('ما لقيت هذي المدينة.');
  const f = (x) => String(x).slice(0, 5);
  return [
    `🕌 مواقيت الصلاة، ${q}`,
    `الفجر: ${f(t.Fajr)}`, `الشروق: ${f(t.Sunrise)}`, `الظهر: ${f(t.Dhuhr)}`,
    `العصر: ${f(t.Asr)}`, `المغرب: ${f(t.Maghrib)}`, `العشاء: ${f(t.Isha)}`,
  ].join('\n');
}

// التاريخ الهجري
async function hijri() {
  const j = await getJson(`https://api.aladhan.com/v1/gToH/${dmy()}`);
  const h = j?.data?.hijri;
  if (!h) throw new UserError('ما قدرت أجيب التاريخ الهجري.');
  return `📅 ${h.weekday?.ar || ''} ${h.day} ${h.month?.ar || ''} ${h.year} هـ\n(${dmy().replace(/-/g, '/')} م)`;
}

// آية عشوائية
async function ayah() {
  const n = 1 + Math.floor(Math.random() * 6236);
  const j = await getJson(`https://api.alquran.cloud/v1/ayah/${n}/quran-uthmani`);
  const d = j?.data;
  if (!d?.text) throw new UserError('ما قدرت أجيب الآية.');
  return `📖 ${d.text}\n\n﴿ ${d.surah?.name || ''} : ${d.numberInSurah} ﴾`;
}

// تحويل عملات: .حول 100 usd sar
async function currency(input) {
  const m = /^([\d.,]+)\s*([a-z]{3})\s*(?:to|->|=|الى|إلى)?\s*([a-z]{3})$/i.exec(arDigits(String(input || '').trim()));
  if (!m) throw new UserError('الصيغة:\n.حول 100 usd sar');
  const amount = Number(m[1].replace(/,/g, ''));
  const from = m[2].toUpperCase(); const to = m[3].toUpperCase();
  if (!Number.isFinite(amount)) throw new UserError('المبلغ غير صحيح.');
  const j = await getJson('https://open.er-api.com/v6/latest/USD');
  const r = j?.rates;
  if (!r || !r[from] || !r[to]) throw new UserError('عملة غير معروفة. استخدم رمز من 3 حروف مثل USD و SAR و EGP.');
  const out = (amount / r[from]) * r[to];
  return `💱 ${amount} ${from} = ${out.toFixed(2)} ${to}`;
}

// الوقت الحالي في مدينة
async function cityTime(city) {
  const q = String(city || '').trim();
  if (!q) throw new UserError('اكتب المدينة، مثال:\n.وقت طوكيو');
  const geo = await getJson(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=1&language=ar`);
  const p = geo?.results?.[0];
  if (!p?.timezone) throw new UserError('ما لقيت هذي المدينة.');
  let when;
  try { when = new Intl.DateTimeFormat('ar', { timeZone: p.timezone, dateStyle: 'full', timeStyle: 'short' }).format(new Date()); }
  catch { when = new Date().toLocaleString('en-GB', { timeZone: p.timezone }); }
  return `🕒 ${p.name}${p.country ? `، ${p.country}` : ''}\n${when}`;
}

// ويكيبيديا (عربي)
async function wiki(term) {
  const q = String(term || '').trim();
  if (!q) throw new UserError('اكتب الكلمة، مثال:\n.ويكي القاهرة');
  const s = await getJson(`https://ar.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(q)}&limit=1&namespace=0&format=json`);
  const title = s?.[1]?.[0];
  if (!title) throw new UserError('ما لقيت نتيجة.');
  const d = await getJson(`https://ar.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`);
  const text = String(d?.extract || '').trim();
  if (!text) throw new UserError('ما لقيت ملخص لهذي الصفحة.');
  const link = d?.content_urls?.desktop?.page || '';
  return `📚 ${d.title || title}\n\n${text.length > 600 ? `${text.slice(0, 600)}…` : text}${link ? `\n\n${link}` : ''}`;
}

module.exports = { calc, translate, weather, qrCode, shorten, prayer, hijri, ayah, currency, cityTime, wiki };
