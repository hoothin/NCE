(() => {
    const RED_PACKET_IMAGE_URL = 'https://s2.loli.net/2024/07/04/1CIsVfT9rxjKwRU.jpg';
    const RED_PACKET_CLAIM_DATE_KEY = 'nceRedPacketClaimDate';

    function hashString(input) {
        let hash = 0;
        const str = String(input || '');
        for (let i = 0; i < str.length; i++) {
            hash = ((hash << 5) - hash) + str.charCodeAt(i);
            hash |= 0;
        }
        return hash;
    }

    function escapeForSvg(value) {
        return String(value || '').replace(/[&<>'"]/g, (char) => {
            switch (char) {
                case '&':
                    return '&amp;';
                case '<':
                    return '&lt;';
                case '>':
                    return '&gt;';
                case '"':
                    return '&quot;';
                case '\'':
                    return '&#39;';
                default:
                    return char;
            }
        });
    }

    function createPlaceholderCover(label, options = {}) {
        const base = (label || '自定义').trim();
        const displayText = base ? base.slice(0, 4) : '自定义';
        const width = Number.isFinite(options.width) ? options.width : 200;
        const height = Number.isFinite(options.height) ? options.height : 200;
        const fontSize = Number.isFinite(options.fontSize) ? options.fontSize : Math.round(Math.min(width, height) * 0.24);
        const colors = ['#1DB954', '#4CAF50', '#2ECC71', '#27AE60', '#00BFA5'];
        const color = colors[Math.abs(hashString(base)) % colors.length];
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
            <defs>
                <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stop-color="${color}" stop-opacity="0.85"/>
                    <stop offset="100%" stop-color="${color}" stop-opacity="0.45"/>
                </linearGradient>
            </defs>
            <rect width="${width}" height="${height}" rx="${Math.round(Math.min(width, height) * 0.04)}" fill="url(#g)"/>
            <text x="50%" y="50%" text-anchor="middle" dominant-baseline="middle" fill="#FFFFFF"
                font-family="Segoe UI, Helvetica, Arial, sans-serif" font-size="${fontSize}">
                ${escapeForSvg(displayText)}
            </text>
        </svg>`;
        return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
    }

    function deriveLrcUrl(filename) {
        if (!filename) {
            return '';
        }
        const queryIndex = filename.indexOf('?');
        const hashIndex = filename.indexOf('#');
        let endIndex = filename.length;
        if (queryIndex !== -1) {
            endIndex = queryIndex;
        }
        if (hashIndex !== -1 && hashIndex < endIndex) {
            endIndex = hashIndex;
        }
        const base = filename.slice(0, endIndex);
        const suffix = filename.slice(endIndex);
        const dotIndex = base.lastIndexOf('.');
        const replaced = dotIndex === -1 ? `${base}.lrc` : `${base.slice(0, dotIndex)}.lrc`;
        return `${replaced}${suffix}`;
    }

    function parseCustomBookKey(rawKey) {
        const str = String(rawKey || '');
        const parts = str.split('|');
        const name = (parts.shift() || '自定义课程').trim() || '自定义课程';
        const cover = parts.length ? parts.join('|').trim() : '';
        return { raw: str, name, cover };
    }

    function loadStoredCustomData() {
        const stored = localStorage.getItem('nceCustomData');
        if (!stored) {
            return null;
        }
        try {
            const parsed = JSON.parse(stored);
            return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
        } catch (_) {
            return null;
        }
    }

    function formatCustomData(data) {
        try {
            return JSON.stringify(data, null, 2);
        } catch (_) {
            return '';
        }
    }

    function sanitizeCustomDataInput(parsed) {
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            throw new Error('根对象必须是以书名为键的对象。');
        }
        const sanitized = {};
        Object.keys(parsed).forEach((bookName) => {
            const lessons = parsed[bookName];
            if (!Array.isArray(lessons)) {
                throw new Error(`“${bookName}” 的数据必须是数组。`);
            }
            sanitized[bookName] = lessons.map((lesson, index) => {
                if (!lesson || typeof lesson !== 'object' || Array.isArray(lesson)) {
                    throw new Error(`“${bookName}” 第 ${index + 1} 项必须是对象。`);
                }
                const title = lesson.title ? String(lesson.title).trim() : '';
                const filename = lesson.filename ? String(lesson.filename).trim() : '';
                if (!title || !filename) {
                    throw new Error(`“${bookName}” 第 ${index + 1} 项缺少 title 或 filename。`);
                }
                const sanitizedLesson = { title, filename };
                const lrc = lesson.lrc ? String(lesson.lrc).trim() : '';
                if (lrc) {
                    sanitizedLesson.lrc = lrc;
                }
                return sanitizedLesson;
            });
        });
        return sanitized;
    }

    function prepareCustomLessons(raw, options = {}) {
        const derive = options.deriveLrc !== false;
        const filterEmpty = options.filterEmpty !== false;
        const prepared = {};
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
            return prepared;
        }
        Object.keys(raw).forEach((bookName) => {
            const lessons = Array.isArray(raw[bookName]) ? raw[bookName] : [];
            const normalized = lessons
                .map((lesson) => {
                    if (!lesson || typeof lesson !== 'object' || Array.isArray(lesson)) {
                        return null;
                    }
                    const title = lesson.title ? String(lesson.title).trim() : '';
                    const filename = lesson.filename ? String(lesson.filename).trim() : '';
                    if (!title || !filename) {
                        return null;
                    }
                    const preparedLesson = { title, filename };
                    const lrc = lesson.lrc ? String(lesson.lrc).trim() : '';
                    preparedLesson.lrc = lrc || (derive ? deriveLrcUrl(filename) : '');
                    if (!preparedLesson.lrc) {
                        delete preparedLesson.lrc;
                    }
                    return preparedLesson;
                })
                .filter(Boolean);
            if (normalized.length || !filterEmpty) {
                prepared[bookName] = normalized;
            }
        });
        return prepared;
    }

    function getCustomLessonsWithDefaults() {
        const raw = loadStoredCustomData();
        return prepareCustomLessons(raw, { deriveLrc: true });
    }

    function normalizeShareOptions(rawOptions = {}) {
        const win = typeof window !== 'undefined' ? window : null;
        const doc = typeof document !== 'undefined' ? document : null;
        const baseUrl = rawOptions.url || (win && win.location ? win.location.href : '');
        let url = String(baseUrl || '').trim();
        if (url && win) {
            try {
                url = new URL(url, win.location.href).toString();
            } catch (_) {
                url = String(url);
            }
        }
        const titleSource = rawOptions.title || (doc ? doc.title : '');
        const descriptionSource = rawOptions.description || rawOptions.summary || '';
        const textSource = rawOptions.text || '';
        const imageSource = rawOptions.image || rawOptions.pic || '';
        return {
            url,
            title: String(titleSource || '').trim(),
            description: String(descriptionSource || '').trim(),
            text: String(textSource || '').trim(),
            image: String(imageSource || '').trim()
        };
    }

    function detectShareEnvironment() {
        const win = typeof window !== 'undefined' ? window : null;
        if (!win || typeof navigator === 'undefined') {
            return {
                isMobile: false,
                isWeChatBrowser: false
            };
        }
        const ua = navigator.userAgent || navigator.vendor || '';
        const isWeChatBrowser = /micromessenger/i.test(ua);
        const isMobile = /android|iphone|ipad|ipod|mobile/i.test(ua);
        return {
            isMobile,
            isWeChatBrowser
        };
    }

    function buildSharePayload(target, options = {}) {
        const normalizedTarget = String(target || '').toLowerCase();
        const { url, title, description, text, image } = normalizeShareOptions(options);
        const composedText = [text, title, description].filter(Boolean).join(' ') || url;
        const searchPic = options.searchPic === false ? '0' : '1';
        switch (normalizedTarget) {
            case 'weibo': {
                const params = new URLSearchParams();
                if (url) params.set('url', url);
                if (composedText) params.set('title', composedText);
                if (image) params.set('pic', image);
                params.set('searchPic', searchPic);
                return {
                    platform: 'weibo',
                    mode: 'popup',
                    url: `https://service.weibo.com/share/share.php?${params.toString()}`
                };
            }
            case 'qq': {
                const params = new URLSearchParams();
                if (url) params.set('url', url);
                if (title || text) params.set('title', title || text);
                if (description) params.set('summary', description);
                if (image) params.set('pics', image);
                return {
                    platform: 'qq',
                    mode: 'popup',
                    url: `https://connect.qq.com/widget/shareqq/index.html?${params.toString()}`
                };
            }
            case 'qzone': {
                const params = new URLSearchParams();
                if (url) params.set('url', url);
                if (title) params.set('title', title);
                if (description) params.set('desc', description);
                if (composedText) params.set('summary', composedText);
                if (image) params.set('pics', image);
                return {
                    platform: 'qzone',
                    mode: 'popup',
                    url: `https://sns.qzone.qq.com/cgi-bin/qzshare/cgi_qzshare_onekey?${params.toString()}`
                };
            }
            case 'wechat': {
                const env = detectShareEnvironment();
                if (env.isWeChatBrowser) {
                    return {
                        platform: 'wechat',
                        mode: 'wechat-internal',
                        url,
                        title: title || composedText,
                        text: composedText
                    };
                }
                const preferNative = env.isMobile && typeof navigator !== 'undefined' && typeof navigator.share === 'function';
                if (preferNative) {
                    return {
                        platform: 'wechat',
                        mode: 'native',
                        url,
                        title: title || composedText,
                        text: composedText
                    };
                }
                const sizeOption = Number.isFinite(options.qrSize) ? Math.round(options.qrSize) : 180;
                const size = Math.min(Math.max(sizeOption, 80), 512);
                const qrUrl = url ? `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(url)}` : '';
                return {
                    platform: 'wechat',
                    mode: 'qr',
                    url,
                    qrImage: qrUrl,
                    title: title || composedText
                };
            }
            case 'native': {
                return {
                    platform: 'native',
                    mode: 'native',
                    url,
                    title: title || '',
                    text: composedText
                };
            }
            case 'copy': {
                return {
                    platform: 'copy',
                    mode: 'copy',
                    url,
                    text: composedText
                };
            }
            default:
                return {
                    platform: normalizedTarget || 'generic',
                    mode: 'link',
                    url,
                    title,
                    text: composedText,
                    description,
                    image
                };
        }
    }

    function openShare(target, options = {}) {
        const payload = buildSharePayload(target, options);
        if (!payload) {
            return null;
        }
        const win = typeof window !== 'undefined' ? window : null;
        if (payload.mode === 'popup' && payload.url && win) {
            const features = options.windowFeatures || 'width=600,height=540,top=100,left=100,toolbar=no,menubar=no,scrollbars=yes,resizable=yes';
            win.open(payload.url, '_blank', features);
        } else if (payload.mode === 'native' && typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
            const shareData = {
                title: payload.title || options.title || '',
                text: payload.text || options.text || '',
                url: payload.url || options.url || ''
            };
            navigator.share(shareData).catch(() => {
                /* noop */
            });
        } else if (payload.mode === 'copy' && options.autoCopy !== false && typeof navigator !== 'undefined' && navigator.clipboard && payload.url) {
            navigator.clipboard.writeText(payload.url).catch(() => {
                /* noop */
            });
        }
        return payload;
    }

    /**
     * 获取本地日期键，用于按自然日控制红包动效。
     * @returns {string} YYYY-MM-DD 格式的本地日期。
     */
    function getLocalDateKey() {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    /**
     * 判断用户当天是否已经点过红包入口。
     * @returns {boolean} 当天已点击返回 true。
     */
    function hasClaimedRedPacketToday() {
        try {
            return localStorage.getItem(RED_PACKET_CLAIM_DATE_KEY) === getLocalDateKey();
        } catch (error) {
            console.warn('Unable to read red packet claim date.', error);
            return false;
        }
    }

    /**
     * 记录用户当天已点击红包入口。
     * @returns {void}
     */
    function markRedPacketClaimedToday() {
        try {
            localStorage.setItem(RED_PACKET_CLAIM_DATE_KEY, getLocalDateKey());
        } catch (error) {
            console.warn('Unable to save red packet claim date.', error);
        }
    }

    /**
     * 创建支付宝红包全屏浮层，并绑定关闭按钮与图片状态提示。
     * @returns {HTMLElement} 全屏浮层根节点。
     */
    function createRedPacketModal() {
        const modal = document.createElement('div');
        modal.id = 'red-packet-modal';
        modal.className = 'red-packet-modal';
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        modal.setAttribute('aria-hidden', 'true');
        modal.setAttribute('aria-label', '支付宝红包浮图');
        modal.innerHTML = `
            <div class="red-packet-modal__panel" role="document">
                <button type="button" class="red-packet-modal__close" data-red-packet-close aria-label="关闭支付宝红包浮图">×</button>
                <img class="red-packet-modal__image" src="${RED_PACKET_IMAGE_URL}" alt="支付宝红包领取二维码" loading="lazy" decoding="async">
                <p class="red-packet-modal__status" aria-live="polite"></p>
            </div>
        `;

        const image = modal.querySelector('.red-packet-modal__image');
        const status = modal.querySelector('.red-packet-modal__status');
        if (image && status) {
            image.addEventListener('load', () => {
                status.textContent = '';
            });
            image.addEventListener('error', () => {
                status.textContent = '图片加载失败，请稍后再试。';
            });
        }

        document.body.appendChild(modal);
        return modal;
    }

    /**
     * 初始化所有支付宝红包入口，点击后打开全屏浮图。
     * @returns {void}
     */
    function initRedPacketPromo() {
        const triggers = document.querySelectorAll('[data-red-packet-trigger]');
        if (!triggers.length) {
            return;
        }

        const modal = document.querySelector('.red-packet-modal') || createRedPacketModal();
        const closeButton = modal.querySelector('[data-red-packet-close]');
        let activeTrigger = null;

        /**
         * 根据当天点击状态同步红包按钮动效显示。
         * @returns {void}
         */
        function syncClaimState() {
            const claimedToday = hasClaimedRedPacketToday();
            triggers.forEach((trigger) => {
                trigger.classList.toggle('is-claimed-today', claimedToday);
            });
        }

        /**
         * 同步所有红包入口的展开状态。
         * @param {boolean} isOpen 弹层是否处于打开状态。
         * @returns {void}
         */
        function updateTriggerState(isOpen) {
            triggers.forEach((trigger) => {
                trigger.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
            });
        }

        /**
         * 关闭红包浮层并恢复触发按钮焦点。
         * @returns {void}
         */
        function closeModal() {
            modal.classList.remove('open');
            modal.setAttribute('aria-hidden', 'true');
            document.body.classList.remove('red-packet-modal-open');
            updateTriggerState(false);
            if (activeTrigger && typeof activeTrigger.focus === 'function') {
                activeTrigger.focus();
            }
            activeTrigger = null;
        }

        /**
         * 打开红包浮层并记录当前触发按钮。
         * @param {Element} trigger 触发打开动作的按钮元素。
         * @returns {void}
         */
        function openModal(trigger) {
            activeTrigger = trigger;
            markRedPacketClaimedToday();
            syncClaimState();
            modal.classList.add('open');
            modal.setAttribute('aria-hidden', 'false');
            document.body.classList.add('red-packet-modal-open');
            updateTriggerState(true);
            if (closeButton) {
                closeButton.focus();
            }
        }

        triggers.forEach((trigger) => {
            trigger.addEventListener('click', () => {
                openModal(trigger);
            });
        });
        syncClaimState();

        if (closeButton) {
            closeButton.addEventListener('click', closeModal);
        }

        modal.addEventListener('click', (event) => {
            if (event.target === modal) {
                closeModal();
            }
        });

        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && modal.classList.contains('open')) {
                closeModal();
            }
        });
    }

    const utils = {
        hashString,
        escapeForSvg,
        createPlaceholderCover,
        deriveLrcUrl,
        parseCustomBookKey,
        loadStoredCustomData,
        formatCustomData,
        sanitizeCustomDataInput,
        prepareCustomLessons,
        getCustomLessonsWithDefaults,
        detectShareEnvironment,
        buildSharePayload,
        openShare
    };

    if (typeof window !== 'undefined') {
        window.NCEUtils = Object.freeze(utils);
    }

    if (typeof document !== 'undefined') {
        document.addEventListener('DOMContentLoaded', initRedPacketPromo);
    }
})();
