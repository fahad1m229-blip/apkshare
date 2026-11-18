const express = require('express');
const multer = require('multer');
const upload = multer({ limits: { fileSize: 20 * 1024 * 1024 } });
const T = process.env.BOT_TOKEN, C = process.env.CHAT_ID;
const app = express();
app.set('trust proxy', 1);

app.get('/', (q, r) => r.send(
  '<h2>APK Share</h2><form method=post action=/upload enctype=multipart/form-data>' +
  '<input type=file name=apk accept=".apk"><br><br><button>Upload</button></form>'));

app.post('/upload', upload.single('apk'), async (req, res) => {
  if (!req.file) return res.send('No file');
  const fd = new FormData();
  fd.append('chat_id', C);
  fd.append('document', new Blob([req.file.buffer]), req.file.originalname);
  const r = await (await fetch(`https://api.telegram.org/bot${T}/sendDocument`,
    { method: 'POST', body: fd })).json();
  if (!r.ok) return res.send('Error: ' + r.description);
  const link = `${req.protocol}://${req.get('host')}/d/${r.result.document.file_id}` +
    `?n=${encodeURIComponent(req.file.originalname)}`;
  res.send(`<p>Your link:</p><a href="${link}">${link}</a>`);
});

app.get('/d/:id', async (req, res) => {
  const g = await (await fetch(`https://api.telegram.org/bot${T}/getFile?file_id=${req.params.id}`)).json();
  if (!g.ok) return res.status(404).send('Not found');
  const f = await fetch(`https://api.telegram.org/file/bot${T}/${g.result.file_path}`);
  const name = String(req.query.n || 'app.apk').replace(/["\r\n]/g, '');
  res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
  res.setHeader('Content-Type', 'application/vnd.android.package-archive');
  res.send(Buffer.from(await f.arrayBuffer()));
});

app.listen(process.env.PORT || 3000);
