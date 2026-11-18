const express = require('express');
const multer = require('multer');
const MAX = 50 * 1024 * 1024, CHUNK = 19 * 1024 * 1024;
const upload = multer({ limits: { fileSize: MAX } }).single('file');
const T = process.env.BOT_TOKEN, C = process.env.CHAT_ID;
const app = express();
app.set('trust proxy', 1);

const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt = b => b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB';

const page = (body, script = '') => `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>FileShare</title>
<style>
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
font-family:system-ui,sans-serif;background:linear-gradient(135deg,#4f46e5,#9333ea);padding:16px}
.card{background:#fff;border-radius:20px;padding:28px 22px;width:100%;max-width:420px;text-align:center;box-shadow:0 20px 50px rgba(0,0,0,.3)}
h1{margin:0 0 6px;font-size:24px;color:#1e1b4b}p{color:#666;margin:6px 0 18px;font-size:14px}
.drop{border:2px dashed #a5b4fc;border-radius:14px;padding:30px 10px;color:#4f46e5;cursor:pointer;display:block;word-break:break-all}
input[type=file]{display:none}
.btn{display:block;width:100%;margin-top:16px;padding:14px;border:0;border-radius:12px;background:#4f46e5;color:#fff;font-size:16px;font-weight:600;text-decoration:none;cursor:pointer}
.btn:disabled{opacity:.5}.bar{height:10px;background:#e5e7eb;border-radius:9px;margin-top:16px;overflow:hidden;display:none}
.bar div{height:100%;width:0;background:#4f46e5;transition:width .2s}
.link{margin-top:16px;padding:10px;background:#f3f4f6;border-radius:10px;font-size:12px;word-break:break-all;display:none;max-height:90px;overflow:auto}
.sec{background:#e5e7eb;color:#111}img{max-width:100%;border-radius:12px;margin-bottom:12px}.big{font-size:44px}
</style></head><body><div class="card">${body}</div>${script}</body></html>`;

app.get('/', (q, r) => r.send(page(`
<h1>📁 FileShare</h1><p>যেকোনো ফাইল আপলোড করুন (সর্বোচ্চ 50 MB)</p>
<label class="drop" id="drop"><input type="file" id="f">👆 ফাইল বাছাই করতে ট্যাপ করুন</label>
<div class="bar" id="bar"><div id="in"></div></div>
<button class="btn" id="up" disabled>Upload</button>
<div class="link" id="link"></div>
<button class="btn sec" id="copy" style="display:none">📋 লিংক কপি করুন</button>`, `<script>
const f=document.getElementById('f'),up=document.getElementById('up'),drop=document.getElementById('drop'),
bar=document.getElementById('bar'),inn=document.getElementById('in'),link=document.getElementById('link'),copy=document.getElementById('copy');
f.onchange=()=>{if(f.files[0]){drop.lastChild.textContent='✅ '+f.files[0].name;up.disabled=false;}};
up.onclick=()=>{const file=f.files[0];if(!file)return;
if(file.size>50*1024*1024){alert('ফাইল 50 MB এর বেশি');return;}
const fd=new FormData();fd.append('file',file);const x=new XMLHttpRequest();
x.open('POST','/upload');up.disabled=true;bar.style.display='block';
x.upload.onprogress=e=>{if(e.lengthComputable){const p=Math.round(e.loaded/e.total*100);inn.style.width=p+'%';up.textContent=p<100?'আপলোড হচ্ছে '+p+'%':'প্রসেস হচ্ছে, অপেক্ষা করুন...';}};
x.onload=()=>{try{const j=JSON.parse(x.responseText);
if(j.link){inn.style.width='100%';up.textContent='✅ হয়ে গেছে';link.style.display='block';link.textContent=j.link;copy.style.display='block';copy.onclick=()=>{navigator.clipboard.writeText(j.link);copy.textContent='✅ কপি হয়েছে';};}
else{alert(j.error||'সমস্যা হয়েছে');up.disabled=false;up.textContent='Upload';}}catch(e){alert('সমস্যা হয়েছে');up.disabled=false;up.textContent='Upload';}};
x.onerror=()=>{alert('নেটওয়ার্ক সমস্যা');up.disabled=false;up.textContent='Upload';};
x.send(fd);};
</script>`)));

app.post('/upload', (req, res) => {
  upload(req, res, async err => {
    if (err) return res.json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'ফাইল 50 MB এর বেশি' : 'আপলোড সমস্যা' });
    if (!req.file) return res.json({ error: 'ফাইল পাওয়া যায়নি' });
    try {
      const buf = req.file.buffer, ids = [];
      for (let i = 0, p = 1; i < buf.length || i === 0; i += CHUNK, p++) {
        const fd = new FormData();
        fd.append('chat_id', C);
        fd.append('document', new Blob([buf.subarray(i, i + CHUNK)]), 'part' + p);
        const r = await (await fetch(`https://api.telegram.org/bot${T}/sendDocument`, { method: 'POST', body: fd })).json();
        if (!r.ok) return res.json({ error: 'Telegram: ' + r.description });
        ids.push(r.result.document.file_id);
        if (buf.length === 0) break;
      }
      const meta = { n: req.file.originalname, m: req.file.mimetype, s: buf.length, c: ids };
      const code = Buffer.from(JSON.stringify(meta)).toString('base64url');
      res.json({ link: `${req.protocol}://${req.get('host')}/d/${code}` });
    } catch (e) { res.json({ error: 'সার্ভার সমস্যা' }); }
  });
});

const decode = c => { try { const m = JSON.parse(Buffer.from(c, 'base64url').toString()); return Array.isArray(m.c) ? m : null; } catch { return null; } };
const IMG = /^image\/(png|jpeg|gif|webp)$/;

app.get('/d/:code', (req, res) => {
  const m = decode(req.params.code);
  if (!m) return res.status(404).send(page('<h1>😕</h1><p>লিংকটি ঠিক নয়</p>'));
  const img = IMG.test(m.m) ? `<img src="/get/${req.params.code}?inline=1">` : '<div class="big">📦</div>';
  res.send(page(`${img}<h1 style="font-size:18px;word-break:break-all">${esc(m.n)}</h1>
<p>${fmt(m.s)}</p><a class="btn" href="/get/${req.params.code}">⬇️ Download</a>`));
});

app.get('/get/:code', async (req, res) => {
  const m = decode(req.params.code);
  if (!m) return res.status(404).send('Not found');
  const inline = req.query.inline && IMG.test(m.m);
  res.setHeader('Content-Type', inline ? m.m : (/^[\w.+-]+\/[\w.+-]+$/.test(m.m) ? m.m : 'application/octet-stream'));
  res.setHeader('Content-Length', m.s);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(m.n)}`);
  try {
    for (const id of m.c) {
      const g = await (await fetch(`https://api.telegram.org/bot${T}/getFile?file_id=${id}`)).json();
      if (!g.ok) throw new Error('x');
      const f = await fetch(`https://api.telegram.org/file/bot${T}/${g.result.file_path}`);
      res.write(Buffer.from(await f.arrayBuffer()));
    }
    res.end();
  } catch (e) { res.destroy(); }
});

app.listen(process.env.PORT || 3000);
