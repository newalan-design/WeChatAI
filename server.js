require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const multer = require('multer');
const FormData = require('form-data');
const path = require('path');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');

const app = express();
const PORT = process.env.PORT || 3000;
const upload = multer({ dest: 'uploads/', limits: { fileSize: 5 * 1024 * 1024 } }); // 5MB
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

// 确保上传目录存在
if (!fs.existsSync('uploads')) {
    fs.mkdirSync('uploads');
}

// 用户数据存储（生产环境应使用数据库）
const USERS_FILE = 'users.json';

// 加载用户数据
function loadUsers() {
    try {
        if (fs.existsSync(USERS_FILE)) {
            const data = fs.readFileSync(USERS_FILE, 'utf8');
            return JSON.parse(data);
        }
    } catch (error) {
        console.error('加载用户数据失败:', error);
    }
    return null;
}

// 保存用户数据
function saveUsers(users) {
    try {
        fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
    } catch (error) {
        console.error('保存用户数据失败:', error);
        throw error;
    }
}

// 初始化默认管理员
function initializeDefaultAdmin() {
    const users = loadUsers();
    if (!users || !users.find(u => u.username === 'admin')) {
        const defaultUsers = users || [];
        const hashedPassword = bcrypt.hashSync('admin', 10);
        defaultUsers.push({
            id: Date.now(),
            username: 'admin',
            password: hashedPassword,
            isAdmin: true,
            createdAt: new Date().toISOString()
        });
        saveUsers(defaultUsers);
        console.log('默认管理员已创建 (admin/admin)');
    }
}

// JWT 验证中间件
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: '未提供访问令牌' });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ error: '无效的访问令牌' });
        }
        req.user = user;
        next();
    });
}

// 管理员权限验证中间件
function requireAdmin(req, res, next) {
    if (!req.user || !req.user.isAdmin) {
        return res.status(403).json({ error: '需要管理员权限' });
    }
    next();
}

// 初始化
initializeDefaultAdmin();

// 中间件
app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// 微信公众号API类
class WeChatAPI {
    constructor(appid, secret) {
        this.appid = appid;
        this.secret = secret;
        this.accessToken = null;
    }

    // 获取访问令牌
    async getAccessToken() {
        if (this.accessToken) {
            return this.accessToken;
        }

        try {
            const url = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${this.appid}&secret=${this.secret}`;
            const response = await axios.get(url);
            const data = response.data;

            if (data.errcode) {
                throw new Error(`获取access_token失败: ${data.errmsg}`);
            }

            this.accessToken = data.access_token;
            return this.accessToken;
        } catch (error) {
            throw new Error(`获取access_token失败: ${error.message}`);
        }
    }

    // 上传临时素材（图片）
    async uploadTempMedia(filePath, type = 'image') {
        try {
            const accessToken = await this.getAccessToken();
            const url = `https://api.weixin.qq.com/cgi-bin/media/upload?access_token=${accessToken}&type=${type}`;

            // 创建FormData
            const form = new FormData();
            form.append('media', fs.createReadStream(filePath));

            const response = await axios.post(url, form, {
                headers: {
                    ...form.getHeaders()
                }
            });
            const data = response.data;

            if (data.errcode) {
                throw new Error(`上传临时素材失败: ${data.errmsg}`);
            }

            return data.media_id;
        } catch (error) {
            throw new Error(`上传临时素材失败: ${error.message}`);
        }
    }

    // 创建草稿
    async addDraft(article) {
        try {
            const accessToken = await this.getAccessToken();
            const url = `https://api.weixin.qq.com/cgi-bin/draft/add?access_token=${accessToken}`;

            const payload = {
                articles: [{
                    title: article.title,
                    author: article.author || '',
                    digest: article.digest || article.content.substring(0, 120),
                    content: article.content,
                    content_source_url: article.sourceUrl || '',
                    thumb_media_id: article.thumbMediaId || '0',
                    show_cover_pic: article.showCoverPic ? 1 : 0,
                    need_open_comment: article.needOpenComment ? 1 : 0,
                    only_fans_can_comment: article.onlyFansCanComment ? 1 : 0
                }]
            };

            const response = await axios.post(url, payload);
            const data = response.data;

            if (data.errcode) {
                throw new Error(`创建草稿失败: ${data.errmsg}`);
            }

            return data;
        } catch (error) {
            throw new Error(`创建草稿失败: ${error.message}`);
        }
    }
}

// 大模型API类
class AIModelAPI {
    constructor(apiKey, apiUrl, model) {
        this.apiKey = apiKey;
        this.apiUrl = apiUrl;
        this.model = model;
    }

    // 改写文章
    async rewrite(content) {
        try {
            const prompt = `请对以下文章内容进行智能改写和优化排版。要求：
1. 保持原文的核心观点和重要信息
2. 优化语言表达，使文章更加流畅易懂
3. 改善文章结构和段落组织
4. 使用适当的标题和分段
5. 保持专业性和准确性
6. 输出格式使用Markdown格式，方便微信公众号排版

原文内容：
${content}

请直接输出改写后的文章内容，不要包含任何解释说明。`;

            const response = await axios.post(
                this.apiUrl,
                {
                    model: this.model,
                    messages: [
                        {
                            role: 'system',
                            content: '你是一个专业的文章编辑，擅长改写和优化排版。'
                        },
                        {
                            role: 'user',
                            content: prompt
                        }
                    ],
                    temperature: 0.7,
                    max_tokens: 4000
                },
                {
                    headers: {
                        'Authorization': `Bearer ${this.apiKey}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            const data = response.data;

            if (data.choices && data.choices.length > 0) {
                return data.choices[0].message.content;
            } else {
                throw new Error('大模型返回结果格式错误');
            }
        } catch (error) {
            if (error.response) {
                throw new Error(`大模型API错误: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
            }
            throw new Error(`大模型调用失败: ${error.message}`);
        }
    }
}

// 爬取公众号文章
async function fetchWeChatArticle(url) {
    try {
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });

        const html = response.data;
        const $ = cheerio.load(html);

        // 提取文章标题
        const title = $('#activity-name').text().trim() || 
                     $('title').text().trim() || 
                     '未命名文章';

        // 提取文章内容
        const content = $('#js_content').text().trim() || 
                       $('.rich_media_content').text().trim() || 
                       '';

        if (!content) {
            throw new Error('无法提取文章内容，请检查URL是否正确');
        }

        return {
            title: title,
            content: content,
            url: url,
            length: content.length
        };
    } catch (error) {
        throw new Error(`爬取文章失败: ${error.message}`);
    }
}

// 认证路由

// 登录
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ error: '用户名和密码不能为空' });
        }

        const users = loadUsers();
        const user = users.find(u => u.username === username);

        if (!user) {
            return res.status(401).json({ error: '用户名或密码错误' });
        }

        const isPasswordValid = await bcrypt.compare(password, user.password);

        if (!isPasswordValid) {
            return res.status(401).json({ error: '用户名或密码错误' });
        }

        const token = jwt.sign(
            {
                id: user.id,
                username: user.username,
                isAdmin: user.isAdmin
            },
            JWT_SECRET,
            { expiresIn: '24h' }
        );

        res.json({
            success: true,
            token: token,
            username: user.username,
            isAdmin: user.isAdmin
        });
    } catch (error) {
        console.error('登录错误:', error);
        res.status(500).json({ error: '登录失败' });
    }
});

// 验证Token
app.post('/api/verify-token', authenticateToken, (req, res) => {
    res.json({
        success: true,
        user: {
            id: req.user.id,
            username: req.user.username,
            isAdmin: req.user.isAdmin
        }
    });
});

// 用户管理路由（需要管理员权限）

// 获取所有用户
app.get('/api/users', authenticateToken, requireAdmin, (req, res) => {
    try {
        const users = loadUsers();
        const safeUsers = users.map(({ password, ...user }) => user);
        res.json({
            success: true,
            users: safeUsers
        });
    } catch (error) {
        console.error('获取用户列表错误:', error);
        res.status(500).json({ error: '获取用户列表失败' });
    }
});

// 创建用户
app.post('/api/users', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { username, password, isAdmin } = req.body;

        if (!username || !password) {
            return res.status(400).json({ error: '用户名和密码不能为空' });
        }

        if (password.length < 6) {
            return res.status(400).json({ error: '密码长度不能少于6位' });
        }

        const users = loadUsers();

        if (users.find(u => u.username === username)) {
            return res.status(400).json({ error: '用户名已存在' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = {
            id: Date.now(),
            username: username,
            password: hashedPassword,
            isAdmin: isAdmin || false,
            createdAt: new Date().toISOString()
        };

        users.push(newUser);
        saveUsers(users);

        const { password: _, ...safeUser } = newUser;
        res.json({
            success: true,
            user: safeUser,
            message: '用户创建成功'
        });
    } catch (error) {
        console.error('创建用户错误:', error);
        res.status(500).json({ error: '创建用户失败' });
    }
});

// 修改密码
app.put('/api/users/:id/password', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { oldPassword, newPassword } = req.body;

        if (!oldPassword || !newPassword) {
            return res.status(400).json({ error: '旧密码和新密码不能为空' });
        }

        if (newPassword.length < 6) {
            return res.status(400).json({ error: '新密码长度不能少于6位' });
        }

        const users = loadUsers();
        const userIndex = users.findIndex(u => u.id === parseInt(id));

        if (userIndex === -1) {
            return res.status(404).json({ error: '用户不存在' });
        }

        // 非管理员只能修改自己的密码
        if (!req.user.isAdmin && req.user.id !== parseInt(id)) {
            return res.status(403).json({ error: '无权修改他人密码' });
        }

        const user = users[userIndex];
        const isPasswordValid = await bcrypt.compare(oldPassword, user.password);

        if (!isPasswordValid) {
            return res.status(401).json({ error: '旧密码错误' });
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);
        users[userIndex].password = hashedPassword;
        saveUsers(users);

        res.json({
            success: true,
            message: '密码修改成功'
        });
    } catch (error) {
        console.error('修改密码错误:', error);
        res.status(500).json({ error: '修改密码失败' });
    }
});

// 删除用户
app.delete('/api/users/:id', authenticateToken, requireAdmin, (req, res) => {
    try {
        const { id } = req.params;
        const userId = parseInt(id);

        // 不能删除管理员自己
        if (userId === req.user.id) {
            return res.status(400).json({ error: '不能删除自己的账号' });
        }

        const users = loadUsers();
        const userIndex = users.findIndex(u => u.id === userId);

        if (userIndex === -1) {
            return res.status(404).json({ error: '用户不存在' });
        }

        const user = users[userIndex];

        // 初始admin不能删除
        if (user.username === 'admin') {
            return res.status(400).json({ error: '不能删除初始管理员账号' });
        }

        users.splice(userIndex, 1);
        saveUsers(users);

        res.json({
            success: true,
            message: '用户删除成功'
        });
    } catch (error) {
        console.error('删除用户错误:', error);
        res.status(500).json({ error: '删除用户失败' });
    }
});

// API路由

// 爬取文章
app.post('/api/fetch', async (req, res) => {
    try {
        const { url } = req.body;

        if (!url || !url.includes('mp.weixin.qq.com')) {
            return res.json({
                success: false,
                error: '请输入有效的微信公众号文章链接'
            });
        }

        const article = await fetchWeChatArticle(url);

        res.json({
            success: true,
            article: article
        });
    } catch (error) {
        console.error('爬取错误:', error);
        res.json({
            success: false,
            error: error.message
        });
    }
});

// 改写文章
app.post('/api/rewrite', async (req, res) => {
    try {
        const { content, apiKey, apiUrl, model } = req.body;

        if (!content || content.trim().length === 0) {
            return res.json({
                success: false,
                error: '文章内容不能为空'
            });
        }

        if (!apiKey) {
            return res.json({
                success: false,
                error: '请提供大模型API Key'
            });
        }

        const aiApi = new AIModelAPI(
            apiKey,
            apiUrl || process.env.AI_API_URL || 'https://api.openai.com/v1/chat/completions',
            model || process.env.AI_MODEL || 'gpt-3.5-turbo'
        );

        const result = await aiApi.rewrite(content);

        res.json({
            success: true,
            result: result
        });
    } catch (error) {
        console.error('改写错误:', error);
        res.json({
            success: false,
            error: error.message
        });
    }
});

// 上传图片到微信公众号
app.post('/api/upload-image', upload.single('image'), async (req, res) => {
    try {
        const { appid, secret } = req.body;

        if (!appid || !secret) {
            return res.json({
                success: false,
                error: '请提供微信公众号AppID和Secret'
            });
        }

        if (!req.file) {
            return res.json({
                success: false,
                error: '请选择要上传的图片'
            });
        }

        const wechat = new WeChatAPI(appid, secret);
        const mediaId = await wechat.uploadTempMedia(req.file.path);

        // 删除临时文件
        fs.unlinkSync(req.file.path);

        res.json({
            success: true,
            media_id: mediaId
        });
    } catch (error) {
        console.error('图片上传错误:', error);
        // 删除临时文件
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
        res.json({
            success: false,
            error: error.message
        });
    }
});

// 发布到微信公众号
app.post('/api/publish', async (req, res) => {
    try {
        const { title, content, appid, secret, thumbMediaId } = req.body;

        if (!title || !content || !appid || !secret) {
            return res.json({
                success: false,
                error: '缺少必要参数'
            });
        }

        const wechat = new WeChatAPI(appid, secret);

        // 转换内容为微信公众号格式
        const formattedContent = content
            .replace(/\n\n/g, '<br><br>')
            .replace(/\n/g, '<br>')
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/### (.*?)(<br>|$)/g, '<h3>$1</h3>')
            .replace(/## (.*?)(<br>|$)/g, '<h2>$1</h2>')
            .replace(/# (.*?)(<br>|$)/g, '<h1>$1</h1>');

        const article = {
            title: title,
            content: formattedContent,
            author: 'AI助手',
            thumbMediaId: thumbMediaId || '0',
            showCoverPic: thumbMediaId ? 1 : 0,
            needOpenComment: true,
            onlyFansCanComment: false
        };

        // 创建草稿
        const result = await wechat.addDraft(article);

        res.json({
            success: true,
            message: '草稿已成功创建',
            data: result
        });
    } catch (error) {
        console.error('发布错误:', error);
        res.json({
            success: false,
            error: error.message
        });
    }
});

// 健康检查
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        message: '服务正常运行',
        timestamp: new Date().toISOString()
    });
});

// 清理上传目录
setInterval(() => {
    const uploadDir = 'uploads/';
    if (fs.existsSync(uploadDir)) {
        fs.readdir(uploadDir, (err, files) => {
            if (err) return;
            
            files.forEach(file => {
                const filePath = path.join(uploadDir, file);
                fs.stat(filePath, (err, stat) => {
                    if (err) return;
                    
                    // 删除超过1小时的文件
                    if (Date.now() - stat.mtime.getTime() > 3600000) {
                        fs.unlinkSync(filePath);
                    }
                });
            });
        });
    }
}, 3600000); // 每小时清理一次

// 404处理
app.use((req, res) => {
    res.status(404).json({
        error: '接口不存在'
    });
});

// 错误处理
app.use((err, req, res, next) => {
    console.error('服务器错误:', err);
    res.status(500).json({
        error: '服务器内部错误'
    });
});

// 启动服务器
app.listen(PORT, () => {
    console.log(`微信公众号文章改写助手已启动`);
    console.log(`访问地址: http://localhost:${PORT}`);
    console.log(`API文档: http://localhost:${PORT}/api/health`);
    console.log(`上传目录: ${path.join(__dirname, 'uploads')}`);
});
