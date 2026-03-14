const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const ffmpeg = require('fluent-ffmpeg');
const app = express();

app.use(express.json());
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const DATA_FILE = path.join(__dirname, 'data.json');

// 确保 uploads 目录存在
if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// 配置 multer
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, UPLOADS_DIR);
    },
    filename: function (req, file, cb) {
        cb(null, file.originalname);
    }
});

const upload = multer({ storage: storage });

// 读取数据库文件
function getDB() {
    try {
        if (!fs.existsSync(DATA_FILE)) return {};
        const content = fs.readFileSync(DATA_FILE, 'utf8');
        return content ? JSON.parse(content) : {};
    } catch (e) {
        console.error('读取 data.json 失败:', e);
        return {};
    }
}

// 写入数据库文件
function saveDB(db) {
    try {
        fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
        console.log('数据已保存到 data.json');
        return true;
    } catch (e) {
        console.error('写入 data.json 失败:', e);
        return false;
    }
}

app.use(express.static(__dirname));
app.use('/uploads', express.static(UPLOADS_DIR));

// 获取视频列表（带分类信息）
app.get('/api/videos', (req, res) => {
    fs.readdir(UPLOADS_DIR, (err, files) => {
        if (err) {
            console.error('读取 uploads 目录失败:', err);
            return res.status(500).json([]);
        }
        
        const videos = files.filter(f => f.toLowerCase().endsWith('.mp4'));
        const db = getDB();
        
        const videosWithInfo = videos.map(video => {
            return {
                filename: video,
                category: db[video]?.category || '未分类'
            };
        });
        
        res.json(videosWithInfo);
    });
});

// 获取分类列表
app.get('/api/categories', (req, res) => {
    const db = getDB();
    const categories = new Set(['未分类']);
    
    Object.keys(db).forEach(videoId => {
        if (db[videoId].category) {
            categories.add(db[videoId].category);
        }
    });
    
    res.json(Array.from(categories));
});

// 为视频设置分类
app.post('/api/set-category', (req, res) => {
    const { videoId, category } = req.body;
    if (!videoId || !category) {
        return res.status(400).json({ error: '缺少必要参数' });
    }

    const db = getDB();
    if (!db[videoId]) db[videoId] = { comments: [], likes: 0, category: '未分类' };
    
    db[videoId].category = category;

    if (saveDB(db)) {
        res.json({ success: true });
    } else {
        res.status(500).json({ error: '分类保存失败，请稍后重试' });
    }
});

// 获取视频的评论和点赞数
app.get('/api/get-data', (req, res) => {
    const db = getDB();
    res.json(db[req.query.videoId] || { comments: [], likes: 0 });
});

// 添加评论
app.post('/api/add-comment', (req, res) => {
    const { videoId, content, user } = req.body;
    if (!videoId || !content || !user) {
        return res.status(400).json({ error: '缺少必要参数' });
    }

    const db = getDB();
    if (!db[videoId]) db[videoId] = { comments: [], likes: 0 };

    db[videoId].comments.push({
        user,
        content,
        time: new Date().toLocaleString('zh-CN', { hour12: false })
    });

    if (saveDB(db)) {
        res.json({ success: true });
    } else {
        res.status(500).json({ error: '评论保存失败，请稍后重试' });
    }
});

// 点赞
app.post('/api/add-like', (req, res) => {
    const { videoId } = req.body;
    if (!videoId) {
        return res.status(400).json({ error: '缺少视频ID' });
    }

    const db = getDB();
    if (!db[videoId]) db[videoId] = { comments: [], likes: 0 };

    db[videoId].likes += 1;

    if (saveDB(db)) {
        res.json({ likes: db[videoId].likes });
    } else {
        res.status(500).json({ error: '点赞保存失败，请稍后重试' });
    }
});

// 生成视频封面
function generateVideoCover(videoPath, coverPath) {
    return new Promise((resolve, reject) => {
        ffmpeg(videoPath)
            .screenshots({
                count: 1,
                timestamps: ['5%'], // 从视频的5%处截取
                filename: path.basename(coverPath),
                folder: path.dirname(coverPath),
                size: '640x360' // 封面尺寸
            })
            .on('end', () => {
                console.log(`封面生成成功: ${coverPath}`);
                resolve(coverPath);
            })
            .on('error', (err) => {
                console.error('封面生成失败:', err);
                reject(err);
            });
    });
}

// 上传视频
app.post('/api/upload', upload.single('video'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: '请选择要上传的视频文件' });
    }
    
    try {
        // 生成封面
        const videoPath = req.file.path;
        const coverPath = path.join(UPLOADS_DIR, req.file.originalname.replace(/\.mp4$/i, '.jpg'));
        await generateVideoCover(videoPath, coverPath);
        
        res.json({ success: true, filename: req.file.originalname });
    } catch (error) {
        console.error('上传处理失败:', error);
        res.json({ success: true, filename: req.file.originalname, warning: '视频上传成功，但封面生成失败' });
    }
});

// 获取视频统计信息
app.get('/api/stats', (req, res) => {
    fs.readdir(UPLOADS_DIR, (err, files) => {
        if (err) {
            console.error('读取 uploads 目录失败:', err);
            return res.status(500).json({ totalVideos: 0, totalCategories: 0 });
        }
        
        const videos = files.filter(f => f.toLowerCase().endsWith('.mp4'));
        const db = getDB();
        
        // 计算分类数量
        const categories = new Set();
        videos.forEach(video => {
            categories.add(db[video]?.category || '未分类');
        });
        
        res.json({
            totalVideos: videos.length,
            totalCategories: categories.size
        });
    });
});

// 启动服务
const PORT = 3000;
app.listen(PORT, () => {
    console.log(`服务器启动`);
});