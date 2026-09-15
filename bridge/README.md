# جسر الشاملة

مكتبتك — ٨٥٩٨ كتابًا و٧٬٦٠٥٬٩٤٧ صفحة — على جهازك، والموقع على الإنترنت.
هذا الجسر يشغّل خادم الشاملة على جهازك ويفتح **البحث وحده** للموقع، بمفتاحٍ يعرفه هو.

الجسر لا يرفع شيئًا ولا ينسخ كتابًا. يفتح منفذًا يُسأل فيُجيب، ويُغلق حين تُغلقه.

## التشغيل

```sh
export BRIDGE_TOKEN="$(openssl rand -hex 24)"       # احفظه، الموقع يحتاجه
export SHAMELA_MCP_CMD="shamela-mcp"                 # أمر تشغيل خادم MCP عندك
# export SHAMELA_MCP_ARGS="--root /srv/shamela"     # إن احتاج وسائط

node bridge/server.js
```

فيعمل على `http://127.0.0.1:8787` — على جهازك وحده، لا يراه أحدٌ بعد.

## فتحه للموقع

```sh
cloudflared tunnel --url http://127.0.0.1:8787
```

يعطيك عنوانًا مثل `https://xxxx.trycloudflare.com`. ضعه في المتصفّح مرةً واحدة:

```js
localStorage.setItem('muwafaqat.bridge', 'https://xxxx.trycloudflare.com');
localStorage.setItem('muwafaqat.token', '<BRIDGE_TOKEN>');
```

وللإحكام، اقصر النطاقات على موقعك:

```sh
export ALLOWED_ORIGINS="https://muwafaqat.example,http://localhost:8080"
```

## المتغيّرات

| المتغيّر | الافتراضي | ماذا |
|---|---|---|
| `BRIDGE_TOKEN` | **مطلوب** | مفتاح الجسر. بلا مفتاحٍ يصير بحث مكتبتك مفتوحًا لمن وجد النفق |
| `SHAMELA_MCP_CMD` | `shamela-mcp` | أمر تشغيل خادم MCP |
| `SHAMELA_MCP_ARGS` | — | وسائط الأمر، مفصولةً بفراغ |
| `PORT` / `HOST` | `8787` / `127.0.0.1` | **لا تجعل HOST=0.0.0.0** إلا وأنت تعرف ما تفعل |
| `ALLOWED_ORIGINS` | الكل | نطاقاتٌ مفصولةٌ بفاصلة |
| `RATE_LIMIT_PER_MINUTE` | `60` | حدّ الطلبات لكل عنوان |
| `MCP_TIMEOUT_MS` | `60000` | مهلة نداء الشاملة |

## النقاط

| النقطة | ماذا تفعل |
|---|---|
| `GET /v1/ping` | حيٌّ أم لا (بلا مفتاح) |
| `GET /v1/health` | حال المكتبة: عدد الكتب والصفحات المفهرسة |
| `POST /v1/search` | بحثٌ خام: `{query, mode:'near'\|'phrase'\|'words', distance, limit, categories}` |
| **`POST /v1/verses`** | **الأهمّ** — استعلامٌ يدخل، أبياتٌ موثَّقةٌ تخرج |
| `POST /v1/page` | نصّ صفحة: `{book_id, page_id}` |

### مثال

```sh
curl -s localhost:8787/v1/verses \
  -H "authorization: Bearer $BRIDGE_TOKEN" \
  -H 'content-type: application/json' \
  -d '{"query":"المطالب التمني","mode":"near","distance":10}' | jq .
```

يُرجع لكل بيت: نصَّه، وقائله (`poet`)، وسنة وفاته وعصره، والكتاب والصفحة،
و`evidence` وهو موضع البيت في الوثيقة التي أثبتته — وبه يُتحقَّق منه.

**انتبه:** `source.bookAuthor` مؤلّف الكتاب، و`poet` قائل البيت. وهما مختلفان
في أكثر الصفحات: صفحةٌ واحدةٌ من «علم المعاني» لعبد العزيز عتيق فيها أبياتٌ
لستّة شعراء. من خلط بينهما كذب على ستّة.

## الاختبار بلا مكتبة

`tests/fake-shamela-mcp.js` خادمٌ مزيَّفٌ يتكلّم MCP ويعيد صفحةً حقيقيةً محفوظة:

```sh
BRIDGE_TOKEN=test SHAMELA_MCP_CMD=node SHAMELA_MCP_ARGS=tests/fake-shamela-mcp.js node bridge/server.js
```

## حدوده

- **يعمل ما دام جهازك مفتوحًا.** هذا قيدُ هذه المرحلة، ويزول بفهرس الأبيات السحابي (المرحلة ٥).
- **نفق `trycloudflare` عنوانه يتبدّل** في كل تشغيل. للثبات: نفقٌ مسمًّى بحسابٍ على Cloudflare.
- **الصفحات تُحفظ في الذاكرة** ما دام الجسر يعمل، وتذهب بإغلاقه.
