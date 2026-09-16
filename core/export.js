// ما يخرج به الباحث من الموقع إلى بحثه.
//
// ★ الغاية: ألّا يُعاد كتابةُ شيءٍ بيده. ★ فالذي جمع ثلاثين بيتًا في دفتره
// يريدها في فصلٍ من رسالته: البيت بشطريه، ثم القائل وعصره، ثم الحاشية
// بالإحالة الكاملة — لا جدولًا خامًا يعيد تنسيقه ساعةً.

import { toArabicDigits as ar } from './normalize.js';
import { citationOf } from './citation.js';
import { rhyme } from './prosody.js';
import { countLabel, PLACE } from './plural.js';

const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function hemistichs(v) {
  const [sadr, ajz] = String(v.text ?? '').split(/\s*(?:\.{3}|…)\s*/);
  return { sadr: sadr ?? v.text ?? '', ajz: ajz ?? '' };
}

/** القافيةُ تُحسب هنا كما تُحسب في البطاقة — فالملفّ صورةُ ما رآه. */
function rhymeLabel(v) {
  const q = rhyme(v.text);
  return q ? `رويّ ${q.rawi}${q.tail.length > 1 ? ` (ـ${q.tail})` : ''}` : '';
}

/** «من قاله أولًا» — والباحث في الموافقات يسأل عنه قبل كل شيء. */
export function byOldest(items) {
  return [...items].sort((a, b) => (a.deathYear ?? Infinity) - (b.deathYear ?? Infinity));
}

/**
 * ملفٌّ يُفتح في Word محافظًا على شكله: البيت شطرين، والإحالة حاشيةً.
 * (HTML لا docx — يفتحه Word وLibreOffice وGoogle Docs بلا مكتبةٍ ولا خادم.)
 */
export function researchHtml(items, { title = 'الموافقات', chronological = true } = {}) {
  const list = chronological ? byOldest(items) : items;
  const rows = list.map((v, i) => {
    const { sadr, ajz } = hemistichs(v);
    const who = v.poet ?? 'قائله غير معروف';
    const life = v.deathYear ? ` (ت ${ar(String(v.deathYear))}هـ${v.era?.name ? ` — ${v.era.name}` : ''})` : '';
    const note = v.note ? `<p class="note">ملاحظتك: ${esc(v.note)}</p>` : '';
    const tags = v.tags?.length ? `<p class="tags">${v.tags.map((t) => `[${esc(t)}]`).join(' ')}</p>` : '';

    // ★ ما يُعرض على الشاشة يخرج في الملفّ. ★
    //   كان الملفّ يحمل البيت والقائل والإحالة وحدها، فيرى الباحث في الموقع
    //   بحرَ القصيدة وغرضَها وشرحَ غريبها ثم لا يجد منها شيئًا فيما يدخل بحثه.
    const said = [];
    if (v.meter) said.push(`البحر: ${esc(v.meter)}`);
    if (v.purpose) said.push(`الغرض: ${esc(v.purpose)}`);
    if (v.occasion) said.push(`قاله ${esc(v.occasion)}`);
    const context = said.length ? `<p class="ctx">${said.join(' · ')} — من الكتاب نفسه</p>` : '';
    const glosses = v.glosses?.length
      ? `<p class="gloss">شرحُ غريبه (من حاشية المحقّق): ${
          v.glosses.map((g) => `${esc(g.word)}: ${esc(g.gloss)}`).join(' · ')}</p>` : '';
    const variant = v.variant ? `<p class="gloss">وفي روايةٍ: ${esc(v.variant)}</p>` : '';
    const doubted = v.doubted
      ? '<p class="gloss">وردَ بين معقوفتين في المطبوع — علامةُ المحقّق على الشكّ فيه.</p>' : '';
    const disputed = v.disputedPoets?.length
      ? `<p class="gloss">اختُلف في نسبته: ${v.disputedPoets.map(esc).join('، ')} — ولم يُرجَّح.</p>` : '';
    const also = v.occurrences > 1
      ? `<p class="gloss">ورد في ${countLabel(v.occurrences, PLACE)}${
          v.alsoIn?.length ? `، منها: ${v.alsoIn.map(esc).join(' · ')}` : ''}.</p>` : '';
    const why = v.why?.label ? `<p class="gloss">سببُ الموافقة: ${esc(v.why.label)}</p>` : '';

    return `<div class="verse-block">
  <p class="n">${ar(String(i + 1))}</p>
  <table class="bayt"><tr><td class="sadr">${esc(sadr)}</td><td class="ajz">${esc(ajz)}</td></tr></table>
  <p class="who">${esc(who)}${life}</p>
  ${context}${glosses}${variant}${doubted}${disputed}${also}${why}${note}${tags}
  <p class="cite">${esc(citationOf(v))}</p>
</div>`;
  }).join('\n');

  return `<!doctype html>
<html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
 body{font-family:"Traditional Arabic","Amiri",serif;font-size:14pt;line-height:1.9;margin:2cm}
 h1{text-align:center;font-size:20pt}
 .verse-block{margin:0 0 18pt;page-break-inside:avoid}
 .n{color:#777;font-size:10pt;margin:0}
 table.bayt{width:100%;border:0;border-collapse:collapse;font-size:16pt}
 table.bayt td{width:50%;padding:2pt 6pt;border:0}
 td.sadr{text-align:right} td.ajz{text-align:left}
 .who{margin:2pt 0;font-weight:bold}
 .cite{margin:2pt 0;font-size:10pt;color:#555}
 .ctx{margin:2pt 0;font-size:10.5pt;color:#333}
 .gloss{margin:1pt 0;font-size:10pt;color:#444}
 .note{margin:2pt 0;font-size:11pt;color:#333}
 .tags{margin:2pt 0;font-size:10pt;color:#777}
 .foot{margin-top:24pt;font-size:9pt;color:#777;border-top:1px solid #ccc;padding-top:6pt}
</style></head><body>
<h1>${esc(title)}</h1>
<p class="foot">${ar(String(list.length))} بيتًا${chronological ? '، مرتَّبةً بالأقدم وفاةً' : ''}.
كلُّ بيتٍ منقولٌ من مصدره كما ورد، ومعه موضعُه منه.</p>
${rows}
<p class="foot">جُمعت بـ«الموافقات». وما لم يُوجد نصُّه في مصدرٍ لم يُعرض.</p>
</body></html>`;
}

/** جدولٌ لمن يبني تحليله بنفسه. */
export function csv(items) {
  const head = ['البيت', 'الصدر', 'العجز', 'القائل', 'سنة الوفاة', 'العصر',
    'البحر', 'الغرض', 'المناسبة', 'القافية', 'شرح الغريب', 'الرواية الأخرى',
    'مواضعه', 'اختُلف في نسبته', 'سبب الموافقة',
    'الكتاب', 'المؤلف', 'الصفحة', 'الرابط', 'ملاحظتك', 'وسومك'];
  const cell = (t) => `"${String(t ?? '').replace(/"/g, '""')}"`;
  const lines = [head.map(cell).join(',')];
  for (const v of items) {
    const { sadr, ajz } = hemistichs(v);
    const s = v.source ?? {};
    lines.push([v.text, sadr, ajz, v.poet ?? '', v.deathYear ?? '', v.era?.name ?? '',
      v.meter ?? '', v.purpose ?? '', v.occasion ?? '',
      rhymeLabel(v), (v.glosses ?? []).map((g) => `${g.word}: ${g.gloss}`).join(' · '),
      v.variant ?? '', v.occurrences ?? 1, (v.disputedPoets ?? []).join('، '), v.why?.label ?? '',
      s.bookName ?? '', s.bookAuthor ?? '', s.printedPage ?? '', s.url ?? '',
      v.note ?? '', (v.tags ?? []).join(' · ')].map(cell).join(','));
  }
  // ★ BOM كي يفتحه Excel بالعربية لا بطلاسم ★
  return '﻿' + lines.join('\n');
}

/** لمن يستعمل Zotero وأخواتِه. */
export function bibtexAll(items) {
  return items.map((v) => citationOf(v, { style: 'bibtex' })).join('\n\n');
}
