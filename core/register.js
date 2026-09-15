// أفصيحٌ هو أم نبطيّ؟
//
// لا سبيل إلى الجزم بحاسوب، لكن للنبطي علاماتٍ لا تكاد تقع في الفصيح:
// «اللي» و«وش» و«مو» و«هالـ» و«ماني». فنقول ما وجدنا، ونقول كم نثق به،
// ★ ولا نصنّف بيتًا نبطيًّا لمجرّد خلوّه من التشكيل. ★

import { normalize } from './normalize.js';

// علاماتٌ قاطعةٌ تقريبًا: لا ترد في الشعر الفصيح
const STRONG = [
  'اللي', 'وش', 'ويش', 'ليش', 'شلون', 'شفيك', 'وشلون',
  'ماني', 'مانيب', 'مو', 'مب', 'يبي', 'ابغى', 'أبغى', 'ودي',
  'جذي', 'كذي', 'كذيه', 'حيل', 'عقب', 'يمه', 'يبه', 'هني',
  'انته', 'انتي', 'احنا', 'هم', 'وياك', 'ويانا', 'عندي', 'تراني', 'تراك',
];

// علاماتٌ مرجِّحةٌ لا قاطعة
const WEAK = [
  'زين', 'بعد', 'ياما', 'عسى', 'عساك', 'يا ما', 'قلط', 'دام', 'لين',
  'واجد', 'شوي', 'خلاص', 'يالله', 'طاري', 'خاطري',
];

const HAL_PREFIX = /(?:^|\s)هال[ء-ي]{2,}/;   // «هالليل» «هالدنيا»

/**
 * يُرجع { register, confidence, markers }
 *   register ∈ 'nabati' | 'fasih'
 *   confidence ∈ 0..1 — وما دون ٠٫٥ يُعرض للمستخدم على أنه ترجيحٌ لا حكم
 */
export function detectRegister(text) {
  const n = ' ' + normalize(text) + ' ';
  const words = n.trim().split(' ').filter(Boolean);
  if (!words.length) return { register: 'fasih', confidence: 0, markers: [] };

  const found = [];
  for (const m of STRONG) if (n.includes(' ' + normalize(m) + ' ')) found.push({ word: m, weight: 'strong' });
  for (const m of WEAK) if (n.includes(' ' + normalize(m) + ' ')) found.push({ word: m, weight: 'weak' });
  if (HAL_PREFIX.test(n)) found.push({ word: 'هالـ', weight: 'strong' });

  const strong = found.filter((f) => f.weight === 'strong').length;
  const weak = found.filter((f) => f.weight === 'weak').length;

  if (strong > 0) {
    return { register: 'nabati', confidence: Math.min(0.95, 0.7 + strong * 0.1), markers: found };
  }
  if (weak >= 2) {
    return { register: 'nabati', confidence: 0.45 + weak * 0.05, markers: found };
  }
  // ★ الخلوّ من العلامات ليس دليلًا قاطعًا على الفصاحة — فالثقة متوسّطة لا تامّة
  return { register: 'fasih', confidence: weak ? 0.5 : 0.7, markers: found };
}
