// 全局状态
let state = {
    originalArticle: null,
    rewrittenArticle: null,
    imageFile: null,
    settings: {},
    user: null
};

// 初始化
document.addEventListener('DOMContentLoaded', function() {
    checkAuth();
});

// 检查认证状态
function checkAuth() {
    const token = localStorage.getItem('token');
    if (!token) {
        window.location.href = '/login.html';
        return;
    }

    loadUserInfo();
    loadSettings();
    resetStatus();
}

// 加载用户信息
async function loadUserInfo() {
    const username = localStorage.getItem('username');
    const isAdmin = localStorage.getItem('isAdmin') === 'true';

    state.user = { username, isAdmin };

    document.getElementById('userName').textContent = username;
    document.getElementById('userRole').textContent = isAdmin ? '管理员' : '用户';
    document.getElementById('userAvatar').textContent = username.charAt(0).toUpperCase();

    // 子账号隐藏账号管理
    if (!isAdmin) {
        document.querySelectorAll('.admin-only').forEach(el => {
            el.style.display = 'none';
        });
    }
}

// 切换页面
function switchSection(sectionName) {
    // 更新导航
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
    });
    document.querySelectorAll('.content-section').forEach(section => {
        section.classList.remove('active');
    });

    // 激活目标
    const activeNav = document.querySelector(`.nav-item[data-section="${sectionName}"]`);
    if (activeNav) activeNav.classList.add('active');

    const activeSection = document.getElementById(`${sectionName}-section`);
    if (activeSection) activeSection.classList.add('active');

    // 加载用户列表
    if (sectionName === 'users') {
        loadUsers();
    }
}

// 退出登录
function logout() {
    if (confirm('确定要退出登录吗？')) {
        localStorage.removeItem('token');
        localStorage.removeItem('username');
        localStorage.removeItem('isAdmin');
        window.location.href = '/login.html';
    }
}

// 图片预览
function previewImage(event) {
    const file = event.target.files[0];
    if (!file) return;

    if (!file.type.match('image.*')) {
        alert('请选择图片文件');
        return;
    }

    if (file.size > 5 * 1024 * 1024) {
        alert('图片大小不能超过5MB');
        return;
    }

    state.imageFile = file;
}

// 显示消息提示
function showMessage(text, type = 'success') {
    const div = document.createElement('div');
    div.className = `alert alert-${type} alert-dismissible fade show`;
    div.style.cssText = 'position: fixed; top: 20px; right: 20px; z-index: 9999; min-width: 300px;';
    div.innerHTML = `
        ${text}
        <button type="button" class="btn-close" onclick="this.parentElement.remove()"></button>
    `;
    document.body.appendChild(div);

    setTimeout(() => div.remove(), 5000);
}

// 更新进度
function updateProgress(percent, text) {
    document.getElementById('progressBar').style.width = `${percent}%`;
    document.getElementById('progressText').textContent = text;
}

// 重置状态
function resetStatus() {
    state.originalArticle = null;
    state.rewrittenArticle = null;
    state.imageFile = null;
    document.getElementById('resultCard').style.display = 'none';
    updateProgress(0, '准备开始...');
    document.getElementById('articleUrl').value = '';
    document.getElementById('articleImage').value = '';
}

// 加载设置
function loadSettings() {
    const saved = localStorage.getItem('wechatSettings');
    if (saved) {
        state.settings = JSON.parse(saved);

        document.getElementById('wechatAppId').value = state.settings.wechatAppId || '';
        document.getElementById('wechatSecret').value = state.settings.wechatSecret || '';
        document.getElementById('aiApiKey').value = state.settings.aiApiKey || '';
        document.getElementById('aiApiUrl').value = state.settings.aiApiUrl || 'https://api.openai.com/v1/chat/completions';
        document.getElementById('aiModel').value = state.settings.aiModel || 'gpt-3.5-turbo';
    }
}

// 保存设置
function saveSettings() {
    const settings = {
        wechatAppId: document.getElementById('wechatAppId').value.trim(),
        wechatSecret: document.getElementById('wechatSecret').value.trim(),
        aiApiKey: document.getElementById('aiApiKey').value.trim(),
        aiApiUrl: document.getElementById('aiApiUrl').value.trim(),
        aiModel: document.getElementById('aiModel').value.trim()
    };

    state.settings = settings;
    localStorage.setItem('wechatSettings', JSON.stringify(settings));
    showMessage('设置已保存');
}

// 开始处理
async function startProcessing() {
    const url = document.getElementById('articleUrl').value.trim();

    if (!url) {
        showMessage('请输入文章URL', 'error');
        return;
    }

    if (!url.includes('mp.weixin.qq.com')) {
        showMessage('请输入有效的微信公众号文章链接', 'error');
        return;
    }

    if (!state.settings.wechatAppId || !state.settings.wechatSecret) {
        showMessage('请先配置微信公众号信息', 'error');
        return;
    }

    if (!state.settings.aiApiKey) {
        showMessage('请先配置大模型API Key', 'error');
        return;
    }

    try {
        updateProgress(20, '正在爬取文章...');
        const articleData = await fetchArticle(url);
        state.originalArticle = articleData;

        updateProgress(50, '正在改写文章...');
        const rewritten = await rewriteArticle(articleData.content);
        state.rewrittenArticle = rewritten;

        updateProgress(80, '正在创建草稿...');
        await publishToWechat();

        updateProgress(100, '处理完成！');

        document.getElementById('resultCard').style.display = 'block';
        document.getElementById('resultContent').innerHTML = `
            <h5>原标题：${articleData.title}</h5>
            <p class="text-muted mb-3">字数：${articleData.content.length} → ${rewritten.length}</p>
            <h6>改写结果预览：</h6>
            <div class="border p-3 bg-light" style="max-height: 300px; overflow-y: auto;">
                <pre style="white-space: pre-wrap; word-wrap: break-word;">${rewritten.substring(0, 500)}...</pre>
            </div>
        `;

        showMessage('文章已成功发布到微信公众号草稿！');

    } catch (error) {
        console.error('处理失败:', error);
        showMessage(`处理失败：${error.message}`, 'error');
        updateProgress(0, '处理失败');
    }
}

// 爬取文章
async function fetchArticle(url) {
    const response = await fetch('/api/fetch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
    });

    const data = await response.json();

    if (!data.success) {
        throw new Error(data.error || '爬取文章失败');
    }

    return data.article;
}

// 改写文章
async function rewriteArticle(content) {
    const response = await fetch('/api/rewrite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            content,
            apiKey: state.settings.aiApiKey,
            apiUrl: state.settings.aiApiUrl,
            model: state.settings.aiModel
        })
    });

    const data = await response.json();

    if (!data.success) {
        throw new Error(data.error || '改写文章失败');
    }

    return data.result;
}

// 发布到微信公众号
async function publishToWechat() {
    let thumbMediaId = null;

    if (state.imageFile) {
        updateProgress(70, '正在上传图片...');
        thumbMediaId = await uploadImage();
    }

    const response = await fetch('/api/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            title: state.originalArticle.title,
            content: state.rewrittenArticle,
            appid: state.settings.wechatAppId,
            secret: state.settings.wechatSecret,
            thumbMediaId: thumbMediaId
        })
    });

    const data = await response.json();

    if (!data.success) {
        throw new Error(data.error || '发布失败');
    }

    return data;
}

// 上传图片
async function uploadImage() {
    const formData = new FormData();
    formData.append('image', state.imageFile);
    formData.append('appid', state.settings.wechatAppId);
    formData.append('secret', state.settings.wechatSecret);

    const response = await fetch('/api/upload-image', {
        method: 'POST',
        body: formData
    });

    const data = await response.json();

    if (!data.success) {
        throw new Error(data.error || '图片上传失败');
    }

    return data.media_id;
}

// ==================== 用户管理功能 ====================

// 加载用户列表
async function loadUsers() {
    const token = localStorage.getItem('token');

    try {
        const response = await fetch('/api/users', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        const data = await response.json();

        if (!data.success) {
            throw new Error(data.error || '加载用户列表失败');
        }

        renderUsersTable(data.users);
    } catch (error) {
        showMessage(`加载用户列表失败：${error.message}`, 'error');
    }
}

// 渲染用户表格
function renderUsersTable(users) {
    const tbody = document.getElementById('usersTableBody');
    tbody.innerHTML = '';

    users.forEach(user => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>
                <div class="d-flex align-items-center gap-2">
                    <div style="width: 32px; height: 32px; border-radius: 50%; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 14px;">
                        ${user.username.charAt(0).toUpperCase()}
                    </div>
                    ${user.username}
                </div>
            </td>
            <td>
                <span class="badge ${user.isAdmin ? 'badge-admin' : 'badge-user'}">
                    ${user.isAdmin ? '管理员' : '普通用户'}
                </span>
            </td>
            <td>${new Date(user.createdAt).toLocaleString('zh-CN')}</td>
            <td>
                <div class="action-buttons">
                    <button class="action-btn btn-edit" onclick="showChangePasswordModal(${user.id}, '${user.username}')" title="修改密码">
                        <i class="bi bi-key"></i>
                    </button>
                    ${user.username !== 'admin' ? `
                        <button class="action-btn btn-delete" onclick="deleteUser(${user.id}, '${user.username}')" title="删除用户">
                            <i class="bi bi-trash"></i>
                        </button>
                    ` : ''}
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// 显示新增用户模态框
function showAddUserModal() {
    document.getElementById('newUsername').value = '';
    document.getElementById('newPassword').value = '';
    document.getElementById('newIsAdmin').checked = false;
    new bootstrap.Modal(document.getElementById('addUserModal')).show();
}

// 创建用户
async function createUser() {
    const username = document.getElementById('newUsername').value.trim();
    const password = document.getElementById('newPassword').value;
    const isAdmin = document.getElementById('newIsAdmin').checked;

    if (!username || !password) {
        showMessage('请填写完整的用户信息', 'error');
        return;
    }

    if (password.length < 6) {
        showMessage('密码长度不能少于6位', 'error');
        return;
    }

    const token = localStorage.getItem('token');

    try {
        const response = await fetch('/api/users', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ username, password, isAdmin })
        });

        const data = await response.json();

        if (!data.success) {
            throw new Error(data.error || '创建用户失败');
        }

        showMessage(data.message || '用户创建成功');
        bootstrap.Modal.getInstance(document.getElementById('addUserModal')).hide();
        loadUsers();
    } catch (error) {
        showMessage(`创建用户失败：${error.message}`, 'error');
    }
}

// 显示修改密码模态框
function showChangePasswordModal(userId, username) {
    document.getElementById('editUserId').value = userId;
    document.getElementById('oldPassword').value = '';
    document.getElementById('newUserPassword').value = '';
    new bootstrap.Modal(document.getElementById('changePasswordModal')).show();
}

// 修改密码
async function changePassword() {
    const userId = document.getElementById('editUserId').value;
    const oldPassword = document.getElementById('oldPassword').value;
    const newPassword = document.getElementById('newUserPassword').value;

    if (!oldPassword || !newPassword) {
        showMessage('请填写完整的密码信息', 'error');
        return;
    }

    if (newPassword.length < 6) {
        showMessage('新密码长度不能少于6位', 'error');
        return;
    }

    const token = localStorage.getItem('token');

    try {
        const response = await fetch(`/api/users/${userId}/password`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ oldPassword, newPassword })
        });

        const data = await response.json();

        if (!data.success) {
            throw new Error(data.error || '修改密码失败');
        }

        showMessage(data.message || '密码修改成功');
        bootstrap.Modal.getInstance(document.getElementById('changePasswordModal')).hide();
    } catch (error) {
        showMessage(`修改密码失败：${error.message}`, 'error');
    }
}

// 删除用户
async function deleteUser(userId, username) {
    if (!confirm(`确定要删除用户"${username}"吗？此操作不可恢复。`)) {
        return;
    }

    const token = localStorage.getItem('token');

    try {
        const response = await fetch(`/api/users/${userId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        const data = await response.json();

        if (!data.success) {
            throw new Error(data.error || '删除用户失败');
        }

        showMessage(data.message || '用户删除成功');
        loadUsers();
    } catch (error) {
        showMessage(`删除用户失败：${error.message}`, 'error');
    }
}
