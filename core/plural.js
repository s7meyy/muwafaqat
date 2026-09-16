// جمع العربية ستُّ صيغ لا صيغتان: صفر، ومفرد، ومثنّى، وقلّة، وكثرة، وغيرها.
// «٣ بيتًا» و«٧ صفحةٍ» خطأٌ يقع فيه من عامل العربية معاملة الإنجليزية.
//   ٠ لم يوجد بيت · ١ بيتٌ واحد · ٢ بيتان · ٣-١٠ أبيات · ١١+ بيتًا

import { toArabicDigits } from './normalize.js';

const rules = new Intl.PluralRules('ar');

/**
 * forms = { zero, one, two, few, many, other } — و«#» تُستبدل بالعدد بالأرقام العربية.
 * مثال: countLabel(3, VERSE) ← «٣ أبيات»
 */
export function countLabel(n, forms) {
  const count = Number(n) || 0;
  const key = count === 0 && forms.zero ? 'zero' : rules.select(count);
  const template = forms[key] ?? forms.other;
  return String(template).replace('#', toArabicDigits(String(count)));
}

export const VERSE = {
  zero: 'لم يوجد بيت', one: 'بيتٌ واحد', two: 'بيتان',
  few: '# أبيات', many: '# بيتًا', other: '# بيت',
};
// ★ العدد والصفة يتغيّران معًا في العربية: «بيتان موافقان» لا «٢ بيت موافقًا».
//   فلا تُركَّب الصفة على ناتج العدد — تُكتب كل صيغةٍ تامّةً بإعرابها.
export const MATCHED_VERSE = {
  zero: 'لم يوجد بيتٌ موافق', one: 'بيتٌ واحدٌ موافق', two: 'بيتان موافقان',
  few: '# أبياتٍ موافقة', many: '# بيتًا موافقًا', other: '# بيتٍ موافق',
};
export const PAGES_READ = {
  zero: 'بلا صفحةٍ تُقرأ', one: 'من صفحةٍ واحدة', two: 'من صفحتين',
  few: 'من # صفحات', many: 'من # صفحة', other: 'من # صفحة',
};

export const PAGE = {
  zero: 'لم تُقرأ صفحة', one: 'صفحةٌ واحدة', two: 'صفحتان',
  few: '# صفحات', many: '# صفحة', other: '# صفحة',
};
export const PLACE = {
  zero: 'لا موضع', one: 'موضعٍ واحد', two: 'موضعين',
  few: '# مواضع', many: '# موضعًا', other: '# موضع',
};
export const SUGGESTION = {
  zero: 'لا مقترح', one: 'مقترحٌ واحد', two: 'مقترحان',
  few: '# مقترحات', many: '# مقترحًا', other: '# مقترح',
};
export const DIFFERENCE = {
  zero: 'لا اختلاف', one: 'موضعُ اختلافٍ واحد', two: 'موضعا اختلاف',
  few: '# مواضع اختلاف', many: '# موضع اختلاف', other: '# موضع اختلاف',
};
export const SHARD = {
  zero: 'بلا شظيّة', one: 'شظيّةٌ واحدة', two: 'شظيّتان',
  few: '# شظايا', many: '# شظيّة', other: '# شظيّة',
};
export const BOOK = {
  zero: 'لا كتاب', one: 'كتابٌ واحد', two: 'كتابان',
  few: '# كتب', many: '# كتابًا', other: '# كتاب',
};
// صيغٌ مجرورةٌ بعد «من» — «من ٢ كتاب» و«من كتابان» كلاهما خطأ
export const BOOK_IN = {
  zero: 'بلا كتاب', one: 'من كتابٍ واحد', two: 'من كتابين',
  few: 'من # كتب', many: 'من # كتابًا', other: 'من # كتاب',
};
export const POET = {
  zero: 'بلا شاعر', one: 'لشاعرٍ واحد', two: 'لشاعرين',
  few: 'لـ# شعراء', many: 'لـ# شاعرًا', other: 'لـ# شاعر',
};
