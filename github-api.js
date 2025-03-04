// 常量配置
const CONFIG = {
    CACHE_SIZE: 50,
    MAX_IMAGES: 20,
    GITHUB_API_BASE: 'https://api.github.com/repos/',
    GITHUB_RAW_BASE: 'https://raw.githubusercontent.com/',
    VALID_IMAGE_TYPES: /\.(jpg|jpeg|png|gif|webp)$/i,
    IMAGE_PATH_PREFIX: 'img/',
};

// 自定义错误类
class GitHubAPIError extends Error {
    constructor(message, statusCode) {
        super(message);
        this.name = 'GitHubAPIError';
        this.statusCode = statusCode;
    }
}

// LRU缓存类优化
class LRUCache {
    constructor(capacity) {
        if (!Number.isInteger(capacity) || capacity <= 0) {
            throw new Error('Cache capacity must be a positive integer');
        }
        this.capacity = capacity;
        this.cache = new Map();
    }

    get(key) {
        if (!this.cache.has(key)) return null;
        const value = this.cache.get(key);
        this.cache.delete(key);
        this.cache.set(key, value);
        return value;
    }

    put(key, value) {
        if (this.cache.has(key)) {
            this.cache.delete(key);
        } else if (this.cache.size >= this.capacity) {
            this.cache.delete(this.cache.keys().next().value);
        }
        this.cache.set(key, value);
    }

    clear() {
        this.cache.clear();
    }

    getSize() {
        return this.cache.size;
    }
}

class GitHubAPI {
    constructor() {
        this.token = localStorage.getItem('github_token');
        this.repo = localStorage.getItem('github_repo');
        this.customUrl = localStorage.getItem('github_custom_url');
        this.commitCache = new LRUCache(CONFIG.CACHE_SIZE);
        this.validateConfiguration();
        this.loadCache();
    }

    validateConfiguration() {
        if (!this.token || !this.repo) {
            throw new GitHubAPIError('GitHub configuration is incomplete', 401);
        }
    }

    getHeaders() {
        return {
            'Authorization': `token ${this.token}`,
            'Accept': 'application/vnd.github.v3+json',
            'Content-Type': 'application/json',
        };
    }

    async fetchWithErrorHandling(url, options) {
        try {
            const response = await fetch(url, {
                ...options,
                headers: this.getHeaders(),
            });

            if (!response.ok) {
                throw new GitHubAPIError(
                    `GitHub API request failed: ${response.statusText}`,
                    response.status
                );
            }

            return await response.json();
        } catch (error) {
            console.error('API request failed:', error);
            throw error;
        }
    }

    getImageUrl(filename) {
        if (this.customUrl) {
            const baseUrl = this.customUrl.endsWith('/') ? this.customUrl : `${this.customUrl}/`;
            return `${baseUrl}${filename}`;
        }
        return `${CONFIG.GITHUB_RAW_BASE}${this.repo}/main/${filename}`;
    }

    async uploadImage(file, path) {
        this.validateConfiguration();
        const base64Content = await this.convertToBase64(file);
        
        return this.fetchWithErrorHandling(
            `${CONFIG.GITHUB_API_BASE}${this.repo}/contents/${path}`,
            {
                method: 'PUT',
                body: JSON.stringify({
                    message: `Upload image: ${file.name}`,
                    content: base64Content,
                }),
            }
        );
    }

    async getCommitDetail(sha) {
        const cachedDetail = this.commitCache.get(sha);
        if (cachedDetail) return cachedDetail;

        const commitDetail = await this.fetchWithErrorHandling(
            `${CONFIG.GITHUB_API_BASE}${this.repo}/commits/${sha}`
        );

        this.commitCache.put(sha, commitDetail);
        this.saveCache();

        return commitDetail;
    }

    async listImages() {
        this.validateConfiguration();

        const commits = await this.fetchWithErrorHandling(
            `${CONFIG.GITHUB_API_BASE}${this.repo}/commits?per_page=${CONFIG.MAX_IMAGES}`
        );

        const imageFiles = new Map();
        
        for (const commit of commits) {
            try {
                const commitDetail = await this.getCommitDetail(commit.sha);
                this.processCommitFiles(commitDetail, commit, imageFiles);
                
                if (imageFiles.size >= CONFIG.MAX_IMAGES) break;
            } catch (error) {
                console.warn('Failed to get commit detail:', error);
                continue;
            }
        }

        return this.sortAndLimitImages(Array.from(imageFiles.values()));
    }

    processCommitFiles(commitDetail, commit, imageFiles) {
        (commitDetail.files || []).forEach(file => {
            if (this.isValidImageFile(file) && !this.isFileRemoved(file)) {
                this.updateImageFiles(file, commit, imageFiles);
            }
        });
    }

    isValidImageFile(file) {
        return file.filename.startsWith(CONFIG.IMAGE_PATH_PREFIX) && 
               CONFIG.VALID_IMAGE_TYPES.test(file.filename);
    }

    isFileRemoved(file) {
        return file.status === 'removed';
    }

    updateImageFiles(file, commit, imageFiles) {
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

    sortAndLimitImages(images) {
        return images
            .sort((a, b) => b.commit_date - a.commit_date)
            .slice(0, CONFIG.CACHE_SIZE);
    }

    async convertToBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
                resolve(reader.result.replace(/^data:.+;base64,/, ''));
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    saveCache() {
        try {
            localStorage.setItem(
                `github_commit_cache_${this.repo}`,
                JSON.stringify(Array.from(this.commitCache.cache.entries()))
            );
        } catch (error) {
            console.warn('Failed to save cache:', error);
        }
    }

    loadCache() {
        try {
            const cacheData = localStorage.getItem(`github_commit_cache_${this.repo}`);
            if (cacheData) {
                JSON.parse(cacheData).forEach(([key, value]) => {
                    this.commitCache.put(key, value);
                });
            }
        } catch (error) {
            console.warn('Failed to load cache:', error);
        }
    }

    clearCache() {
        this.commitCache.clear();
        localStorage.removeItem(`github_commit_cache_${this.repo}`);
    }
}