// تصنيفاتُ الشاملة التي يسكنها الشعر — بأسمائها، ليُقال للباحث ما بُحث فيه
// وما لم يُبحث. ★ فسكوتُ الفهرس ليس سكوتَ الشعر. ★

export const CATEGORY_NAMES = {
  3: 'التفسير', 7: 'شروح الحديث', 23: 'الرقائق والآداب', 25: 'التاريخ',
  26: 'التراجم والطبقات', 27: 'الأنساب', 28: 'البلدان والرحلات',
  29: 'كتب اللغة', 30: 'الغريب والمعاجم', 31: 'النحو والصرف',
  32: 'الأدب', 33: 'العروض والقوافي', 34: 'الشعر ودواوينه', 35: 'البلاغة',
};

// ما يُفهرَس افتراضًا (انظر bridge/shamela.js)
export const INDEXED_BY_DEFAULT = [34, 32, 30, 31, 35, 33, 23, 26];

// ما فيه شعرٌ كثيرٌ ولا يُفهرَس افتراضًا
export const NOT_INDEXED_BY_DEFAULT = [7, 3, 25, 29, 27, 28];

export function categoryName(id) {
  return CATEGORY_NAMES[Number(id)] ?? null;
}

/**
 * ما لم يُبحث فيه: تصنيفاتٌ فيها شعرٌ ولم يظهر منها شيءٌ في الفهرس.
 * `present` أرقامُ التصنيفات التي في الفهرس فعلًا.
 */
export function missingCategories(present = []) {
  const have = new Set(present.map(Number));
  return [...INDEXED_BY_DEFAULT, ...NOT_INDEXED_BY_DEFAULT]
    .filter((id) => !have.has(id))
    .map((id) => ({ id, name: categoryName(id) }))
    .filter((c) => c.name);
}
