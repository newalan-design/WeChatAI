# 微信公众号文章改写助手

一个基于 Node.js 的微信公众号文章改写工具，集成了大模型 AI 能力，可以自动爬取公众号文章、使用 AI 改写内容，并直接发布到微信公众号草稿。
![预览](image.png)
![功能](image-1.png)
## 功能特点

- 🕷️ **自动爬取** - 输入公众号文章 URL，自动提取文章内容
- 🤖 **AI 改写** - 使用大模型智能改写和优化文章
- 📤 **一键发布** - 直接发布到微信公众号草稿
- 👥 **用户管理** - 支持多用户和权限管理
- 🔐 **安全认证** - JWT 令牌认证，保护系统安全
- 📱 **响应式设计** - 美观的用户界面，支持多端访问
![Uploading image.png…]()


## 技术栈

### 后端
- Node.js + Express
- JWT 认证
- bcrypt 密码加密
- Axios (HTTP 请求)
- Cheerio (网页爬取)
- Multer (文件上传)

### 前端
- 原生 JavaScript
- Bootstrap 5
- Bootstrap Icons

## 安装与运行

### 1. 安装依赖

\`\`\`bash
npm install
\`\`\`

### 2. 配置环境变量

复制 `.env.example` 为 `.env`，并配置相关参数：

\`\`\`bash
cp .env.example .env
\`\`\`

修改 `.env` 文件中的配置：

\`\`\`env
PORT=3000
JWT_SECRET=your-secret-key-change-in-production
AI_API_URL=https://api.openai.com/v1/chat/completions
AI_MODEL=gpt-3.5-turbo
\`\`\`

### 3. 启动服务

\`\`\`bash
# 开发模式（自动重启）
npm run dev

# 生产模式
npm start
\`\`\`

### 4. 访问应用

打开浏览器访问：http://localhost:3000

默认管理员账号：
- 用户名：`admin`
- 密码：`admin`

⚠️ **重要**：首次登录后请立即修改默认密码！

## 使用指南

### 1. 登录系统

使用默认管理员账号登录，或由管理员创建新账号。

### 2. 配置 API

在"系统设置"页面配置：
- 微信公众号的 AppID 和 AppSecret
- 大模型 API 的 Key、URL 和模型名称

### 3. 改写文章

1. 输入公众号文章 URL
2. （可选）上传文章主图
3. 点击"开始处理"
4. 系统将自动完成：爬取 → 改写 → 发布

### 4. 用户管理（管理员）

- 查看用户列表
- 创建新用户
- 修改用户密码
- 删除用户

## API 文档

### 认证接口

- `POST /api/login` - 用户登录
- `POST /api/verify-token` - 验证令牌

### 用户管理

- `GET /api/users` - 获取用户列表（需管理员权限）
- `POST /api/users` - 创建用户（需管理员权限）
- `PUT /api/users/:id/password` - 修改密码
- `DELETE /api/users/:id` - 删除用户（需管理员权限）

### 文章处理

- `POST /api/fetch` - 爬取文章
- `POST /api/rewrite` - 改写文章
- `POST /api/upload-image` - 上传图片
- `POST /api/publish` - 发布到微信公众号

### 其他

- `GET /api/health` - 健康检查

## 注意事项

1. **安全性**：
   - 修改默认管理员密码
   - 使用强 JWT_SECRET
   - 不要将 `.env` 文件提交到版本控制

2. **微信公众号配置**：
   - 需要开通微信公众号开发者权限
   - AppSecret 需要妥善保管

3. **大模型 API**：
   - 需要准备有效的大模型 API Key
   - 支持 OpenAI 格式的 API 接口

## 项目结构

\`\`\`
wechat-ai-rewrite/
├── server.js           # 后端服务器
├── package.json        # 项目依赖
├── .env.example        # 环境变量示例
├── .gitignore          # Git 忽略文件
└── public/             # 前端文件
    ├── index.html      # 主页面
    ├── login.html      # 登录页面
    └── app.js          # 前端逻辑
\`\`\`

## 开发建议

1. 生产环境建议：
   - 使用 PM2 进行进程管理
   - 配置反向代理（Nginx）
   - 启用 HTTPS
   - 使用真实数据库（如 MongoDB/MySQL）

2. 功能扩展：
   - 添加更多 AI 模型支持
   - 支持批量改写
   - 添加文章历史记录
   - 支持定时任务

## 许可证

MIT License

## 作者

newalan-design

## 致谢

感谢所有开源项目的贡献者！
