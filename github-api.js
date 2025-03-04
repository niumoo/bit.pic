class LRUCache {
    constructor(capacity) {
        this.capacity = capacity;
        this.cache = new Map();
    }

    get(key) {
        if (!this.cache.has(key)) return null;

        // 获取值
        const value = this.cache.get(key);
        // 删除后重新插入，保持最近使用的在最后
        this.cache.delete(key);
        this.cache.set(key, value);
        return value;
    }

    put(key, value) {
        if (this.cache.has(key)) {
            // 如果已存在，删除旧值
            this.cache.delete(key);
        } else if (this.cache.size >= this.capacity) {
            // 如果达到容量限制，删除最早使用的项（第一个）
            const firstKey = this.cache.keys().next().value;
            this.cache.delete(firstKey);
        }
        // 插入新值
        this.cache.set(key, value);
    }

    clear() {
        this.cache.clear();
    }
}

class GitHubAPI {
    constructor() {
        this.token = localStorage.getItem('github_token');
        this.repo = localStorage.getItem('github_repo');
        this.commitCache = new LRUCache(50); // 缓存最多50个提交详情
        this.customUrl = localStorage.getItem('github_custom_url');
        // 从 localStorage 加载缓存
        this.loadCache();
    }

    getImageUrl(filename) {
        if (this.customUrl) {
            // 确保自定义URL以斜杠结尾
            const baseUrl = this.customUrl.endsWith('/') ? this.customUrl : this.customUrl + '/';
            return baseUrl + filename;
        }
        return `https://raw.githubusercontent.com/${this.repo}/main/${filename}`;
    }

    async uploadImage(file, path) {
        if (!this.token || !this.repo) {
            throw new Error('GitHub 配置未完成');
        }

        const base64Content = await this.convertToBase64(file);
        const response = await fetch(`https://api.github.com/repos/${this.repo}/contents/${path}`, {
            method: 'PUT',
            headers: {
                'Authorization': `token ${this.token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                message: `Upload image: ${file.name}`,
                content: base64Content,
            })
        });

        if (!response.ok) {
            throw new Error('上传失败');
        }

        return await response.json();
    }

    // 保存缓存到 localStorage
    saveCache() {
        const cacheData = Array.from(this.commitCache.cache.entries());
        try {
            localStorage.setItem(
                `github_commit_cache_${this.repo}`,
                JSON.stringify(cacheData)
            );
        } catch (e) {
            console.warn('Failed to save cache to localStorage:', e);
        }
    }

    // 从 localStorage 加载缓存
    loadCache() {
        try {
            const cacheData = localStorage.getItem(`github_commit_cache_${this.repo}`);
            if (cacheData) {
                const entries = JSON.parse(cacheData);
                entries.forEach(([key, value]) => {
                    this.commitCache.put(key, value);
                });
            }
        } catch (e) {
            console.warn('Failed to load cache from localStorage:', e);
        }
    }

    // 清除缓存
    clearCache() {
        this.commitCache.clear();
        localStorage.removeItem(`github_commit_cache_${this.repo}`);
    }

    async getCommitDetail(sha) {
        // 先检查缓存
        const cachedDetail = this.commitCache.get(sha);
        if (cachedDetail) {
            return cachedDetail;
        }

        // 如果缓存中没有，则请求API
        const response = await fetch(
            `https://api.github.com/repos/${this.repo}/commits/${sha}`,
            {
                headers: {
                    'Authorization': `token ${this.token}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            }
        );

        if (!response.ok) {
            throw new Error('获取提交详情失败');
        }

        const commitDetail = await response.json();
        
        // 存入缓存
        this.commitCache.put(sha, commitDetail);
        // 保存到 localStorage
        this.saveCache();

        return commitDetail;
    }

    async listImages() {
        if (!this.token || !this.repo) {
            throw new Error('GitHub 配置未完成');
        }

        try {
            // 获取最近的提交记录
            const commitsResponse = await fetch(
                `https://api.github.com/repos/${this.repo}/commits?per_page=20`,
                {
                    headers: {
                        'Authorization': `token ${this.token}`,
                        'Accept': 'application/vnd.github.v3+json'
                    }
                }
            );

            if (!commitsResponse.ok) {
                throw new Error('获取提交历史失败');
            }

            const commits = await commitsResponse.json();
            const imageFiles = new Map();

            // 遍历每个提交
            for (const commit of commits) {
                try {
                    const commitDetail = await this.getCommitDetail(commit.sha);
                    const files = commitDetail.files || [];

                    // 处理这个提交中的文件
                    for (const file of files) {
                        if (file.status !== 'removed' && 
                            file.filename.startsWith('img/') && 
                            /\.(jpg|jpeg|png|gif|webp)$/i.test(file.filename)) {
                            
                            if (!imageFiles.has(file.filename) || 
                                imageFiles.get(file.filename).sha !== file.sha) {
                                
                                imageFiles.set(file.filename, {
                                    path: file.filename,
                                    sha: file.sha,
                                    raw_url: this.getImageUrl(file.filename),
                                    commit_date: new Date(commit.commit.author.date)
                                });
                            }
                        }
                    }

                    if (imageFiles.size >= 20) break;
                } catch (error) {
                    console.warn('获取提交详情失败:', error);
                    continue; // 继续处理下一个提交
                }
            }

            return Array.from(imageFiles.values())
                .sort((a, b) => b.commit_date - a.commit_date)
                .slice(0, 50);

        } catch (error) {
            console.error('获取图片列表失败:', error);
            throw new Error('获取图片列表失败');
        }
    }

    async convertToBase64(file) {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => {
                const base64String = reader.result
                    .replace(/^data:.+;base64,/, '');
                resolve(base64String);
            };
            reader.readAsDataURL(file);
        });
    }
}