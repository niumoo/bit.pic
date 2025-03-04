class ImageBed {
    constructor() {
        this.github = new GitHubAPI();
        this.initElements();
        this.bindEvents();
        this.loadImages();
        this.initPasteUpload();
    }

    // 统一的图片上传处理方法
    async handleImageUpload(file, source = 'upload') {
        if (!this.github.token || !this.github.repo) {
            this.showErrorToast('请先配置 GitHub Token 和仓库信息');
            return false;
        }

        if (!file.type.startsWith('image/')) {
            this.showErrorToast('只能上传图片文件');
            return false;
        }

        try {
            this.showUploadingToast(`正在上传${source === 'paste' ? '粘贴的' : ''}图片...`);

            const timestamp = Date.now();
            const prefix = source === 'paste' ? 'paste-' : '';
            const newFileName = `${prefix}${timestamp}${this.getImageExtension(file.type)}`;
            
            // 创建新的文件对象
            const newFile = new File([file], newFileName, { type: file.type });
            
            // 转换为WebP
            const webpFile = await this.convertToWebP(newFile);
            const year = new Date().getFullYear();
            const path = `img/${year}/${timestamp}.webp`;
            
            await this.github.uploadImage(webpFile, path);
            await this.loadImages();
            
            this.showSuccessToast('图片上传成功！');
            return true;
        } catch (error) {
            console.error('上传失败:', error);
            this.showErrorToast(`上传失败: ${error.message}`);
            return false;
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

    showUploadingToast(message = '正在上传...') {
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

    async convertToWebP(file) {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = img.width;
                canvas.height = img.height;
                
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0);
                
                canvas.toBlob((blob) => {
                    resolve(new File([blob], file.name, { type: 'image/webp' }));
                }, 'image/webp', 0.9);
            };
            img.src = URL.createObjectURL(file);
        });
    }

    // 图片加载和展示
    async loadImages() {
        try {
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
            this.showErrorToast(`加载图片失败: ${error.message}`);
        }
    }
}

new ImageBed();
