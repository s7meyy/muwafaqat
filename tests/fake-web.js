// شبكةٌ مزيَّفة: نتائجُ بحثٍ وصفحاتٌ من ثلاث درجاتِ توثيق.
// فيها موقعُ شعرٍ متخصص (منشور)، ومنتدًى وتغريدةٌ نبطية (متداوَل)،
// وصفحةٌ نثريةٌ لا شعر فيها — لتُختبر القافيةُ على منع الإيجابيات الكاذبة.

const PAGES = {
  'https://www.aldiwan.net/poem1': {
    title: 'دع الأيام تفعل ما تشاء - الإمام الشافعي',
    html: `<html><head><title>دع الأيام تفعل ما تشاء - الإمام الشافعي</title></head><body>
      <div class="poem">
        <span>دع الأيام تفعل ما تشاء</span><span>وطب نفسا اذا حكم القضاء</span>
        <span>ولا تجزع لحادثة الليالي</span><span>فما لحوادث الدنيا بقاء</span>
        <span>وكن رجلا على الأهوال جلدا</span><span>وشيمتك السماحة والوفاء</span>
      </div></body></html>`,
  },
  'https://montada.example.net/showthread.php?t=9': {
    title: 'أبيات في الصبر - منتدى',
    html: `<html><head><title>أبيات في الصبر - منتدى الأدب</title></head><body>
      <p>السلام عليكم، وجدت هذي الأبيات ونسبوها للشافعي والله أعلم</p>
      <div><span>ولا تر للأعادي قط ذلا</span><span>فإن شماتة الأعدا بلاء</span>
      <span>ولا ترج السماحة من بخيل</span><span>فما في النار للظمآن ماء</span></div>
      </body></html>`,
  },
  'https://x.com/someone/status/123': {
    title: 'تغريدة',
    html: `<html><head><title>على X: قصيدة نبطية</title></head><body>
      <article><span>اللي يبي العالي عليه السهر</span><span>ومن طلب عالي المراقي صبر</span>
      <span>ودي اقول وخاطري ما يطاوع</span><span>لكن عسى دربي يجيب الخبر</span></article>
      </body></html>`,
  },
  'https://blog.example.com/prose': {
    title: 'مقالة',
    html: `<html><head><title>عن الصبر</title></head><body>
      <p>الصبر جميل</p><p>وهو مفتاح الفرج</p><p>وقد قال الحكماء</p>
      <p>إن الصبر عند الصدمة</p><p>وهذا كلام نفيس</p><p>ينبغي حفظه</p>
      </body></html>`,
  },
};

export function installFakeWeb() {
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const u = String(url);

    if (u.includes('api.search.brave.com')) {
      return new Response(JSON.stringify({ web: { results: Object.entries(PAGES).map(([link, p]) => ({
        url: link, title: p.title, description: '',
      })) } }), { status: 200, headers: { 'content-type': 'application/json' } });
    }

    const page = PAGES[u];
    if (page) {
      return new Response(page.html, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } });
    }
    if (original && (u.includes('openrouter') || u.includes('generativelanguage') || u.includes('groq'))) {
      return original(url, init);
    }
    throw new Error(`لا صفحة مزيّفة لـ ${u}`);
  };
  return () => { globalThis.fetch = original; };
}

export const FAKE_WEB_ENV = { BRAVE_API_KEY: 'fake' };

/** مُحلِّلٌ وهميّ: كل مضيفٍ يشير إلى عنوانٍ عامّ — ليُختبر الجلب لا الـDNS. */
export const fakeLookup = async () => [{ address: '93.184.216.34', family: 4 }];
