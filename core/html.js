// HTML ← نصّ. بلا مكتبة، ولا DOM.
//
// صفحات الشعر على الشبكة تضع كلَّ شطرٍ في عنصرٍ مستقل، فحدودُ العناصر هي
// حدودُ الأشطر — ولو جُرّدت الوسوم بلا مبالاةٍ لالتصق الشطران والبيتان.

const BLOCK = /<\/?(?:p|div|br|li|tr|td|th|h[1-6]|section|article|blockquote|pre|span)\b[^>]*>/gi;
const DROP = /<(script|style|noscript|svg|head)\b[^>]*>[\s\S]*?<\/\1>/gi;
const TAG = /<[^>]+>/g;

const ENTITIES = {
  '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"',
  '&#39;': "'", '&apos;': "'", '&laquo;': '«', '&raquo;': '»', '&hellip;': '…',
  '&mdash;': '—', '&ndash;': '–', '&rsquo;': '’', '&lsquo;': '‘',
};

export function decodeEntities(text) {
  return String(text ?? '')
    .replace(/&[a-z]+;|&#\d+;/gi, (e) => {
      if (ENTITIES[e]) return ENTITIES[e];
      const num = /&#(\d+);/.exec(e);
      return num ? String.fromCodePoint(Number(num[1])) : e;
    });
}

/** يُرجع نصًّا بأسطرٍ تحترم حدود العناصر. */
export function htmlToText(html) {
  let s = String(html ?? '');
  s = s.replace(DROP, ' ');
  s = s.replace(BLOCK, '\n');
  s = s.replace(TAG, ' ');
  s = decodeEntities(s);
  return s
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => line.replace(/[ \t ]+/g, ' ').trim())
    // ★ تُسقَط الأسطر الفارغة: وسوم <span> المتجاورة تولّد فراغًا بين الشطرين،
    //   وهو يقطع تتابعَ الأشطر فيضيع البيت. والفراغ لا يحمل معنًى هنا أصلًا.
    .filter((line) => line !== '')
    .join('\n')
    .trim();
}

/** عنوان الصفحة — يُعرض للمستخدم بدل الرابط الطويل. */
export function titleOf(html) {
  const m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(String(html ?? ''));
  return m ? decodeEntities(m[1]).replace(/\s+/g, ' ').trim() : null;
}
