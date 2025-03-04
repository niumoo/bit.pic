class ImageBed {
    constructor() {
        this.github = new GitHubAPI();
        this.initElements();
        this.bindEvents();
        this.loadImages();
    }

    initElements() {
        this.configBtn = document.getElementById('configBtn');
        this.configModal = document.getElementById('configModal');
        this.configForm = document.getElementById('configForm');
        this.cancelConfigBtn = document.getElementById('cancelConfig');
        this.dropZone = document.getElementById('dropZone');
        this.fileInput = document.getElementById('fileInput');
        this.gallery = document.getElementById('imageGallery');

        // 初始化配置表单值
        document.getElementById('token').value = localStorage.getItem('github_token') || '';
        document.getElementById('repo').value = localStorage.getItem('github_repo') || '';
        document.getElementById('customUrl').value = localStorage.getItem('github_custom_url') || '';
        // 添加URL预览更新逻辑
        this.updateUrlPreview();
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

    bindEvents() {
        this.configBtn.addEventListener('click', () => this.configModal.style.display = 'block');
        this.cancelConfigBtn.addEventListener('click', () => this.configModal.style.display = 'none');
        this.configForm.addEventListener('submit', (e) => this.handleConfig(e));
        
        this.dropZone.addEventListener('click', () => this.fileInput.click());
        this.dropZone.addEventListener('dragover', (e) => e.preventDefault());
        this.dropZone.addEventListener('drop', (e) => this.handleDrop(e));
        this.fileInput.addEventListener('change', (e) => this.handleFiles(e.target.files));

        // 添加URL预览更新事件
        document.getElementById('customUrl').addEventListener('input', () => this.updateUrlPreview());
        document.getElementById('repo').addEventListener('input', () => this.updateUrlPreview());
   
    }

    async handleConfig(e) {
        e.preventDefault();
        const token = document.getElementById('token').value;
        const repo = document.getElementById('repo').value;
        const customUrl = document.getElementById('customUrl').value.trim();

        // 如果仓库发生变化，清除旧的缓存
        if (this.github.repo !== repo) {
            this.github.clearCache();
        }

        localStorage.setItem('github_token', token);
        localStorage.setItem('github_repo', repo);
        localStorage.setItem('github_custom_url', customUrl);
        
        this.github.token = token;
        this.github.repo = repo;
        this.github.customUrl = customUrl;
        
        this.configModal.style.display = 'none';
        await this.loadImages();
    }

    async handleFiles(files) {
        for (const file of files) {
            if (!file.type.startsWith('image/')) continue;

            try {
                const webpFile = await this.convertToWebP(file);
                const year = new Date().getFullYear();
                const timestamp = Date.now();
                const path = `img/${year}/${timestamp}.webp`;
                
                await this.github.uploadImage(webpFile, path);
                await this.loadImages();
            } catch (error) {
                alert(`上传失败: ${error.message}`);
            }
        }
    }

    handleDrop(e) {
        e.preventDefault();
        this.handleFiles(e.dataTransfer.files);
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

    async loadImages() {
        try {
            const files = await this.github.listImages();
            this.gallery.innerHTML = '';
            
            for (const file of files) {
                const div = document.createElement('div');
                div.className = 'gallery-item';
                
                const fileName = file.path.split('/').pop();
                const uploadDate = file.commit_date.toLocaleString();

                div.innerHTML = `
                    <img src="${file.raw_url}" alt="${fileName}">
                    <div class="copy-btn-group">
                        <button class="copy-url-btn" data-url="${file.raw_url}">复制图片链接</button>
                        <button class="copy-url-btn md" data-url="${file.raw_url}" data-filename="${fileName}">复制MD链接</button>
                    </div>
                `;
                
                // 为两个按钮分别添加事件监听
                const copyBtns = div.querySelectorAll('.copy-url-btn');
                copyBtns.forEach(btn => {
                    btn.addEventListener('click', async (e) => {
                        const url = e.target.dataset.url;
                        const isMd = e.target.classList.contains('md');
                        let textToCopy;

                        if (isMd) {
                            textToCopy = `![](${url})`;
                        } else {
                            textToCopy = url;
                        }

                        try {
                            await navigator.clipboard.writeText(textToCopy);
                            
                            // 保存按钮原始文本
                            const originalText = e.target.textContent;
                            
                            // 显示成功提示
                            e.target.textContent = '复制成功!';
                            e.target.classList.add('copy-success');
                            
                            // 1.5秒后恢复原样
                            setTimeout(() => {
                                e.target.textContent = originalText;
                                e.target.classList.remove('copy-success');
                            }, 1500);
                        } catch (err) {
                            alert('复制失败，请手动复制');
                            // 创建一个临时文本区域用于手动复制
                            const textarea = document.createElement('textarea');
                            textarea.value = textToCopy;
                            document.body.appendChild(textarea);
                            textarea.select();
                            try {
                                document.execCommand('copy');
                                textarea.remove();
                                alert('已复制到剪贴板');
                            } catch (e) {
                                textarea.remove();
                                alert('请手动复制以下内容：\n' + textToCopy);
                            }
                        }
                    });
                });
                
                this.gallery.appendChild(div);
            }
        } catch (error) {
            console.error('加载图片失败:', error);
            alert('加载图片失败: ' + error.message);
        }
    }
}

new ImageBed();
