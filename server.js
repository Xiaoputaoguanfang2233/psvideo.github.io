const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(express.json());
const uploadDir = path.join(__dirname, 'uploads');
const dbPath = path.join(__dirname, 'data.json');

app.use((req, res, next) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    next();
});

if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
if (!fs.existsSync(dbPath)) fs.writeFileSync(dbPath, JSON.stringify({}));

app.use(express.static(__dirname));
app.use('/videos', express.static(uploadDir));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/api/videos', (req, res) => {
    const files = fs.readdirSync(uploadDir);
    const videoFiles = files.filter(f => f.match(/\.(mp4|webm|mkv)$/i));

    const data = videoFiles.map(name => {
        const baseName = name.substring(0, name.lastIndexOf('.'));
        const cover = files.find(f => f.startsWith(baseName) && f.match(/\.(jpg|jpeg|png|webp)$/i));
        return { name, cover: cover ? `/videos/${cover}` : null };
    });
    res.json(data);
});

app.get('/v/:id', (req, res) => {
    res.sendFile(path.join(__dirname, 'video.html'));
});

app.get('/api/interaction/:name', (req, res) => {
    const db = JSON.parse(fs.readFileSync(dbPath));
    let data = db[req.params.name];
    if (!data) {
        data = { likes: 0, coins: 0, collects: 0, comments: [] };
    } else if (!data.comments) {
        data.comments = [];
    }
    res.json(data);
});

app.post('/api/interaction', (req, res) => {
    const { name, type } = req.body;
    const db = JSON.parse(fs.readFileSync(dbPath));
    if (!db[name]) {
        db[name] = { likes: 0, coins: 0, collects: 0, comments: [] };
    }
    db[name][type]++;
    fs.writeFileSync(dbPath, JSON.stringify(db));
    res.json(db[name]);
});

app.post('/api/comments', (req, res) => {
    const { name, author, content } = req.body;
    if (!name || !content) return res.status(400).json({ error: '缺少参数' });
    const db = JSON.parse(fs.readFileSync(dbPath));
    if (!db[name]) {
        db[name] = { likes: 0, coins: 0, collects: 0, comments: [] };
    } else if (!db[name].comments) {
        db[name].comments = [];
    }
    const comment = {
        id: Date.now() + Math.random().toString(36).substr(2, 5),
        author: author || '匿名',
        content: content,
        time: new Date().toISOString()
    };
    db[name].comments.push(comment);
    fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
    res.json(comment);
});

app.listen(3000, () => console.log('服务器已开启 你的ip或者localhost加上‘:3000’ 请注意'));