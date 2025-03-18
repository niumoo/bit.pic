class ImageBed {
    constructor() {
        this.github = new GitHubAPI();
        this.initElements();
        this.bindEvents();
        this.loadImages();
        this.initPasteUpload();
        this.currentFile = null;
        this.initUploadOptions();
    }

    initUploadOptions() {
        this.qualitySelect = document.getElementById('imageQuality');
        this.limitSizeCheck = document.getElementById('limitSize');
        this.startUploadBtn = document.getElementById('startUpload');
        this.previewArea = document.getElementById('previewArea');
        this.previewImage = document.getElementById('previewImage');
        this.imageSizeSpan = document.getElementById('imageSize');

        // 添加质量选择和尺寸限制的变化监听
        this.qualitySelect.addEventListener('change', () => this.updatePreview());
        this.limitSizeCheck.addEventListener('change', () => this.updatePreview());
        this.startUploadBtn.addEventListener('click', () => this.handlePendingUploads());
    }

    async updatePreview() {
        if (!this.currentFile) return;
        
        try {
            // 转换为WebP并更新预览
            const webpFile = await this.convertToWebP(this.currentFile);
            const previewUrl = URL.createObjectURL(webpFile);
            this.previewImage.src = previewUrl;
            
            // 更新文件大小显示
            const sizeKB = (webpFile.size / 1024).toFixed(2);
            this.imageSizeSpan.textContent = `${sizeKB} KB`;

            // 存储转换后的文件
            this.pendingFiles = [webpFile];
        } catch (error) {
            console.error('预览更新失败:', error);
            this.showErrorToast('预览更新失败');
        }
    }

    async convertToWebP(file) {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;

                // 如果启用了尺寸限制且宽度超过1200px
                if (this.limitSizeCheck.checked && width > 1200) {
                    const ratio = 1200 / width;
                    width = 1200;
                    height = Math.round(height * ratio);
                }

                canvas.width = width;
                canvas.height = height;
                
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                
                const quality = parseFloat(this.qualitySelect.value);
                canvas.toBlob((blob) => {
                    const webpFile = new File([blob], file.name.replace(/\.[^/.]+$/, '.webp'), { 
                        type: 'image/webp' 
                    });
                    resolve(webpFile);
                }, 'image/webp', quality);
            };
            img.src = URL.createObjectURL(file);
        });
    }

    async handleImageUpload(file, source = 'upload') {
        if (!this.github.token || !this.github.repo) {
            this.showErrorToast('请先配置 GitHub Token 和仓库信息');
            return false;
        }

        if (!file.type.startsWith('image/')) {
            this.showErrorToast('只能上传图片文件');
            return false;
        }

        // 保存当前文件并显示预览区域
        this.currentFile = file;
        this.previewArea.style.display = 'block';
        
        // 立即更新预览
        await this.updatePreview();
    }

    async handlePendingUploads() {
        if (!this.currentFile || this.pendingFiles.length === 0) {
            this.showErrorToast('没有待上传的图片');
            return;
        }

        try {
            this.showProcessToast(`正在上传图片...`);
            const timestamp = Date.now();
            const year = new Date().getFullYear();
            const path = `img/${year}/${timestamp}.webp`;
            
            await this.github.uploadImage(this.pendingFiles[0], path);
            await this.loadImages();
            
            // 清理当前状态
            this.currentFile = null;
            this.pendingFiles = [];
            this.previewArea.style.display = 'none';
            
            this.showSuccessToast('图片上传成功！');
        } catch (error) {
            console.error('上传失败:', error);
            this.showErrorToast(`上传失败: ${error.message}`);
        }
    }



    // Toast 提示相关方法
    showToast(message, type = 'info') {
        const existingToast = document.querySelector('.toast');
        if (existingToast) {
            existingToast.remove();
        }

        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;
        document.body.appendChild(toast);

        setTimeout(() => {
            toast.classList.add('toast-fade-out');
            setTimeout(() => toast.remove(), 300);
        }, 2000);
    }

    showProcessToast(message = '正在上传...') {
        this.showToast(message, 'info');
    }

    showSuccessToast(message) {
        this.showToast(message, 'success');
    }

    showErrorToast(message) {
        this.showToast(message, 'error');
    }

    // 复制功能处理
    async handleCopy(text, button) {
        try {
            await navigator.clipboard.writeText(text);
            const originalText = button.textContent;
            button.textContent = '复制成功!';
            button.classList.add('copy-success');
            
            setTimeout(() => {
                button.textContent = originalText;
                button.classList.remove('copy-success');
            }, 1500);
        } catch (err) {
            this.fallbackCopy(text);
        }
    }

    fallbackCopy(text) {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        document.body.appendChild(textarea);
        textarea.select();
        
        try {
            document.execCommand('copy');
            this.showSuccessToast('已复制到剪贴板');
        } catch (e) {
            this.showErrorToast('复制失败，请手动复制');
        } finally {
            textarea.remove();
        }
    }

    // 初始化和事件绑定
    initElements() {
        this.configBtn = document.getElementById('configBtn');
        this.configModal = document.getElementById('configModal');
        this.configForm = document.getElementById('configForm');
        this.cancelConfigBtn = document.getElementById('cancelConfig');
        this.dropZone = document.getElementById('dropZone');
        this.fileInput = document.getElementById('fileInput');
        this.gallery = document.getElementById('imageGallery');

        // 初始化配置值
        ['token', 'repo', 'customUrl'].forEach(id => {
            document.getElementById(id).value = localStorage.getItem(`github_${id}`) || '';
        });

        this.updateUrlPreview();
    }

    bindEvents() {
        this.configBtn.addEventListener('click', () => this.configModal.style.display = 'block');
        this.cancelConfigBtn.addEventListener('click', () => this.configModal.style.display = 'none');
        this.configForm.addEventListener('submit', e => this.handleConfig(e));
        
        this.dropZone.addEventListener('click', () => this.fileInput.click());
        this.dropZone.addEventListener('dragover', e => e.preventDefault());
        this.dropZone.addEventListener('drop', e => {
            e.preventDefault();
            Array.from(e.dataTransfer.files).forEach(file => this.handleImageUpload(file));
        });
        
        this.fileInput.addEventListener('change', e => {
            Array.from(e.target.files).forEach(file => this.handleImageUpload(file));
        });

        ['customUrl', 'repo'].forEach(id => {
            document.getElementById(id).addEventListener('input', () => this.updateUrlPreview());
        });
    }

    initPasteUpload() {
        document.addEventListener('paste', async e => {
            // 如果是在输入框中粘贴，则不处理
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
                return;
            }
            e.preventDefault();
            const items = (e.clipboardData || window.clipboardData).items;
            if (!items) return;

            for (const item of items) {
                if (item.type.indexOf('image') !== -1) {
                    const file = item.getAsFile();
                    if (file) {
                        await this.handleImageUpload(file, 'paste');
                    }
                }
            }
        });
    }

    // 配置和预览相关
    async handleConfig(e) {
        e.preventDefault();
        const formData = ['token', 'repo', 'customUrl'].reduce((acc, id) => {
            acc[id] = document.getElementById(id).value.trim();
            return acc;
        }, {});

        if (this.github.repo !== formData.repo) {
            this.github.clearCache();
        }

        Object.entries(formData).forEach(([key, value]) => {
            localStorage.setItem(`github_${key}`, value);
            this.github[key] = value;
        });

        this.configModal.style.display = 'none';
        // 检查仓库是否存在，不存在则创建
        const repoExists = await this.github.checkRepoExists();
        if (!repoExists) {
            this.showProcessToast(`正在创建目标仓库...`);
            await this.github.createRepo();
        }
        await this.loadImages();
    }

    updateUrlPreview() {
        const repo = document.getElementById('repo').value || 'user/repo';
        const customUrl = document.getElementById('customUrl').value;
        const examplePath = 'img/example.webp';
        
        const previewUrl = customUrl ? 
            (customUrl.endsWith('/') ? customUrl + examplePath : customUrl + '/' + examplePath) :
            `https://raw.githubusercontent.com/${repo}/main/${examplePath}`;
        
        document.getElementById('urlPreview').textContent = previewUrl;
    }

    // 工具方法
    getImageExtension(mimeType) {
        const extensions = {
            'image/jpeg': '.jpg',
            'image/png': '.png',
            'image/gif': '.gif',
            'image/webp': '.webp',
            'image/bmp': '.bmp'
        };
        return extensions[mimeType] || '.png';
    }

    // 图片加载和展示
    async loadImages() {
        try {
            this.showProcessToast(`正在加载最近图片信息....`);
            const files = await this.github.listImages();
            this.gallery.innerHTML = '';
            
            files.forEach(file => {
                const div = document.createElement('div');
                div.className = 'gallery-item';
                
                const fileName = file.path.split('/').pop();
                
                div.innerHTML = `
                    <img src="${file.raw_url}" alt="${fileName}">
                    <div class="copy-btn-group">
                        <button class="copy-url-btn" data-url="${file.raw_url}">复制图片链接</button>
                        <button class="copy-url-btn md" data-url="${file.raw_url}">复制MD链接</button>
                    </div>
                `;
                
                div.querySelectorAll('.copy-url-btn').forEach(btn => {
                    btn.addEventListener('click', () => {
                        const url = btn.dataset.url;
                        const text = btn.classList.contains('md') ? `![](${url})` : url;
                        this.handleCopy(text, btn);
                    });
                });
                
                this.gallery.appendChild(div);
            });
        } catch (error) {
            console.error('加载图片失败:', error);
            this.showErrorToast(`${error.message}`);
        }
    }
}

new ImageBed();
