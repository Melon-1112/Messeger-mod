// dev by n0trxxan.1112 — Minimalist UI Adapter (Full Platform + Messenger Comet Theme Sync)
(function () {
    'use strict';

    const THEME_STORAGE_KEY = 'n0trxxan_theme';
    const SVG_NS = 'http://www.w3.org/2000/svg';
    const BLOCK_SEEN_KEY = 'n0trxxan_block_seen';
    const BLOCK_TYPING_KEY = 'n0trxxan_block_typing';
    const PRIVATE_MODE_KEY = 'n0trxxan_private_mode';
    const SIDEBAR_HIDDEN_KEY = 'n0trxxan_sidebar_hidden';
    const ALWAYS_ON_TOP_KEY = 'n0trxxan_always_on_top';
    const BG_ON_CLOSE_KEY = 'n0trxxan_bg_on_close';
    const ZOOM_FACTOR_KEY = 'n0trxxan_zoom_factor';

    function sendHost(type, payload) {
        if (window.ipc && typeof window.ipc.postMessage === 'function') {
            try {
                window.ipc.postMessage(JSON.stringify({ type: type, payload: payload }));
            } catch (_) {}
        }
    }

    // ================= MODULE 0: PROTOCOL, SOCKET, WEBRTC, IDB & BLOB INTERCEPTORS =================
    const ANTI_RECALL_ENABLED_KEY = 'n0trxxan_anti_recall_enabled';
    const MSG_LEDGER_KEY = 'n0trxxan_msg_ledger_v5';
    const RECALL_LOG_KEY = 'n0trxxan_recalled_log_v2';

    const UNSENT_TOMBSTONE_RE =
        /(đã thu hồi(?: một)? (?:tin nhắn|file|ảnh|video|nhãn dán|âm thanh|bình chọn)|bạn đã thu hồi|tin nhắn (?:này )?đã (?:bị |được )?(?:thu hồi|gỡ|x(?:óa|oá))|đã gỡ(?: một)? (?:tin nhắn|file|ảnh|video|nhãn dán|âm thanh)|bạn đã gỡ|đã x(?:óa|oá)(?: một)? (?:tin nhắn|file|ảnh|video|nhãn dán|âm thanh)|bạn đã x(?:óa|oá)(?: một)? (?:tin nhắn|file|ảnh|video)|vừa thu hồi một tin nhắn|unsent a message|you unsent a message|unsent an attachment|removed a message|you removed a message|message was (?:unsent|removed|deleted)|this message was (?:unsent|removed|deleted)|deleted a message|you deleted a message)/i;

    const TIMESTAMP_ONLY_RE =
        /^(\d{1,2}:\d{2}(\s*(SA|CH|AM|PM))?(\s*(T[2-7]|CN|Th\s*\d))?|\d{1,2}\s+thg\s+\d+(?:,\s*\d{4})?(?:\s+lúc\s+\d{1,2}:\d{2})?|Hôm nay.*|Hôm qua.*|(?:T[2-7]|Thứ\s+[^\d]+|CN|Chủ\s+nhật)\s+\d{1,2}:\d{2})$/i;

    const SYSTEM_E2EE_RE =
        /(mã hóa đầu cuối|end-to-end encrypted|tin nhắn và cuộc gọi được bảo mật|chỉ những người tham gia đoạn chat|đã nâng cấp tính năng bảo mật|bạn hiện đã được kết nối|you're now connected|đang đồng bộ|đang kết nối|bắt đầu đoạn chat)/i;

    const SYSTEM_SHORT_RE =
        /^(tìm hiểu thêm|learn more|đã gửi|đã xem|đã nhận|đang nhập|đang hoạt động|active now|bạn đã gửi.*|đã bày tỏ cảm xúc.*|trả lời|reply|chuyển tiếp|forward|xem thêm|more|gỡ|remove|báo cáo|report|sao chép|copy|ghim|pin)$/i;

    const SYSTEM_A11Y_NOISE_RE =
        /(chưa chọn đoạn chat|hãy chọn một đoạn chat|no chats? selected|select a chat|cuộc trò chuyện với\s+|conversation with\s+|^(?:nhập,\s*)?(?:tin nhắn do\s+.+\s+gửi(?:\s+lúc.*)?|bạn đã gửi(?:\s+lúc.*)?|enter,\s*message sent by\s+.+|message sent by\s+.+)$)/i;

    function readStoredFlag(lsKey, hostVal, defaultVal) {
        if (typeof hostVal === 'boolean') return hostVal;
        try {
            const raw = localStorage.getItem(lsKey);
            if (raw === '1' || raw === 'true') return true;
            if (raw === '0' || raw === 'false') return false;
        } catch (_) {}
        return defaultVal;
    }

    function readStoredTheme(hostTheme) {
        try {
            const stored = localStorage.getItem(THEME_STORAGE_KEY);
            if (stored === 'light' || stored === 'dark') return stored;
        } catch (_) {}
        return hostTheme === 'light' ? 'light' : 'dark';
    }

    function readStoredZoom(hostZoom) {
        if (typeof hostZoom === 'number' && isFinite(hostZoom) && hostZoom >= 0.7 && hostZoom <= 1.6) {
            return Math.round(hostZoom * 100) / 100;
        }
        try {
            const raw = parseFloat(localStorage.getItem(ZOOM_FACTOR_KEY) || '');
            if (isFinite(raw) && raw >= 0.7 && raw <= 1.6) return Math.round(raw * 100) / 100;
        } catch (_) {}
        return 1.0;
    }

    const initCfg = (window.__CAPRINE_INITIAL_STATE && typeof window.__CAPRINE_INITIAL_STATE === 'object')
        ? window.__CAPRINE_INITIAL_STATE
        : {};

    const featureState = {
        antiRecall: readStoredFlag(ANTI_RECALL_ENABLED_KEY, initCfg.anti_recall, true),
        blockSeen: readStoredFlag(BLOCK_SEEN_KEY, initCfg.block_seen, false),
        blockTyping: readStoredFlag(BLOCK_TYPING_KEY, initCfg.block_typing, false),
        privateMode: readStoredFlag(PRIVATE_MODE_KEY, initCfg.private_mode, false),
        sidebarHidden: readStoredFlag(SIDEBAR_HIDDEN_KEY, initCfg.sidebar_hidden, false),
        alwaysOnTop: readStoredFlag(ALWAYS_ON_TOP_KEY, initCfg.always_on_top, false),
        backgroundOnClose: readStoredFlag(BG_ON_CLOSE_KEY, initCfg.background_on_close, true),
        runAtStartup: typeof initCfg.run_at_startup === 'boolean' ? initCfg.run_at_startup : false,
        zoomFactor: readStoredZoom(initCfg.zoom_factor),
        theme: readStoredTheme(initCfg.theme),
    };

    let antiRecallEnabled = featureState.antiRecall;

    function normalizeMsgText(text) {
        if (!text) return '';
        const raw = typeof text === 'string' ? text : String(text);
        const norm = typeof raw.normalize === 'function' ? raw.normalize('NFC') : raw;
        return norm.replace(/\s+/g, ' ').trim();
    }

    function normalizeMetaId(rawId) {
        if (rawId == null) return '';
        if (typeof rawId === 'string') return rawId.trim();
        if (typeof rawId === 'number' && !isNaN(rawId)) return String(rawId);
        if (typeof rawId === 'bigint') return String(rawId);
        if (
            Array.isArray(rawId) &&
            rawId.length === 2 &&
            typeof rawId[0] === 'number' &&
            typeof rawId[1] === 'number'
        ) {
            return 'i64:' + rawId[0] + '_' + rawId[1];
        }
        return '';
    }

    function isUnsentTombstoneText(text) {
        if (!text) return false;
        const clean = normalizeMsgText(text);
        if (!clean || clean.length > 180) return false;
        return UNSENT_TOMBSTONE_RE.test(clean);
    }

    function isSystemOrTimestampText(text) {
        if (!text) return true;
        const clean = normalizeMsgText(text);
        if (!clean) return true;
        if (TIMESTAMP_ONLY_RE.test(clean)) return true;
        if (SYSTEM_E2EE_RE.test(clean)) return true;
        if (SYSTEM_SHORT_RE.test(clean)) return true;
        if (SYSTEM_A11Y_NOISE_RE.test(clean)) return true;
        return false;
    }

    function isValidCapturedContent(text, media) {
        if (Array.isArray(media) && media.length > 0) return true;
        if (!text) return false;
        return !isUnsentTombstoneText(text) && !isSystemOrTimestampText(text);
    }

    function getCurrentThreadKey() {
        const path = (window.location && window.location.pathname) || '';
        const match = path.match(/\/(?:e2ee\/)?t\/([^/?#]+)/);
        return match ? match[1] : path || 'default';
    }

    function stripTrackingParams(url) {
        try {
            const keys = [];
            url.searchParams.forEach(function (_v, k) {
                if (
                    k.indexOf('fbclid') === 0 ||
                    k.indexOf('__xts__') === 0 ||
                    k.indexOf('__tn__') === 0
                ) {
                    keys.push(k);
                }
            });
            for (let i = 0; i < keys.length; i++) {
                url.searchParams.delete(keys[i]);
            }
        } catch (_) {}
        return url;
    }

    function unwrapMessageLinkUrl(rawHref) {
        if (!rawHref || typeof rawHref !== 'string') return '';
        let trimmed = rawHref.trim();
        if (!trimmed || trimmed === '#' || trimmed.startsWith('javascript:') || trimmed.startsWith('blob:') || trimmed.startsWith('data:')) {
            return '';
        }
        if (/^www\./i.test(trimmed)) {
            trimmed = 'https://' + trimmed;
        }
        try {
            let url = new URL(trimmed, (window.location && window.location.href) || 'https://www.messenger.com/');
            for (let hop = 0; hop < 3; hop++) {
                const h = (url.hostname || '').toLowerCase();
                if (
                    (h.endsWith('messenger.com') || h.endsWith('facebook.com')) &&
                    url.pathname &&
                    url.pathname.indexOf('/l.php') !== -1
                ) {
                    const unwrapped = url.searchParams.get('u');
                    if (unwrapped && /^https?:\/\//i.test(unwrapped)) {
                        url = new URL(unwrapped);
                        continue;
                    }
                }
                break;
            }
            const host = (url.hostname || '').toLowerCase();
            if (
                host.endsWith('messenger.com') ||
                host.endsWith('facebook.com') ||
                host.endsWith('workplace.com')
            ) {
                const p = url.pathname || '';
                if (
                    p.indexOf('/t/') !== -1 ||
                    p.indexOf('/e2ee/') !== -1 ||
                    p.indexOf('/messages/') !== -1 ||
                    p.indexOf('/help') === 0 ||
                    p.indexOf('/privacy') === 0 ||
                    p.indexOf('/policies') === 0 ||
                    p === '/'
                ) {
                    return '';
                }
            }
            if (url.protocol === 'http:' || url.protocol === 'https:' || url.protocol === 'mailto:') {
                return stripTrackingParams(url).href;
            }
            return '';
        } catch (_) {
            return '';
        }
    }

    function buildMessageKey(info) {
        if (!info) return '';
        const mediaSig = Array.isArray(info.media)
            ? info.media
                  .map(function (m) {
                      return (m.kind || '') + ':' + (m.blobKey || m.fallbackUrl || m.src || '');
                  })
                  .join(',')
            : '';
        return (info.sender || '') + '|' + (info.text || '') + '|' + mediaSig;
    }

    const protectedBlobMap = new Map();
    let protectedBlobBytes = 0;
    const MAX_PROTECTED_BLOBS = 120;
    const MAX_PROTECTED_BYTES = 160 * 1024 * 1024;
    const mediaSourceByUrl = new Map();
    const mediaSourceChunks = new WeakMap();
    const activeMediaSources = [];
    const MAX_MSE_STREAMS = 6;
    const MAX_MSE_BYTES_PER_STREAM = 24 * 1024 * 1024;
    let origUrlRevoke = null;

    function resolvePlayableBlobUrl(url) {
        if (!url || typeof url !== 'string') return '';
        if (typeof clonedBlobUrlMap === 'object' && clonedBlobUrlMap[url] && clonedBlobUrlMap[url] !== 'pending') {
            return clonedBlobUrlMap[url];
        }
        if (protectedBlobMap.has(url)) return url;
        const ms = mediaSourceByUrl.get(url);
        if (ms) {
            const rec = mediaSourceChunks.get(ms);
            if (rec && rec.createdUrl) return rec.createdUrl;
            if (rec && rec.parts && rec.parts.length > 0 && typeof Blob === 'function' && typeof URL === 'function' && typeof URL.createObjectURL === 'function') {
                try {
                    const baseMime = (rec.mime || '').split(';')[0].trim() || 'video/mp4';
                    const assembled = new Blob(rec.parts, { type: baseMime });
                    const newUrl = URL.createObjectURL(assembled);
                    rec.createdUrl = newUrl;
                    if (typeof clonedBlobUrlMap === 'object') {
                        clonedBlobUrlMap[url] = newUrl;
                    }
                    return newUrl;
                } catch (_) {}
            }
        }
        return '';
    }

    const protocolVault = {
        byMsgId: Object.create(null),
        recentList: [],
        recalledById: Object.create(null),
        recalledQueue: [],
        stats: {
            wsOpen: 0,
            wsFrames: 0,
            idbWrites: 0,
            recallsCaught: 0,
            blockedRevokes: 0,
            blockedSeen: 0,
            blockedTyping: 0,
            modHooks: 0,
            modSeenBlk: 0,
            modTypBlk: 0,
            workerBlk: 0,
            wsSeenBlk: 0,
            wsTypBlk: 0,
            httpBlk: 0,
            hookedNames: [],
        },
    };

    let lastPrivacyDiagTs = 0;
    let privacyDiagBurstCount = 0;

    function updatePrivacyStatsUi() {
        if (typeof document === 'undefined' || !document || typeof document.getElementById !== 'function') return;
        const el = document.getElementById('n0trxxan-priv-stats');
        if (!el) return;
        const seenCount = protocolVault.stats.blockedSeen || 0;
        const typCount = protocolVault.stats.blockedTyping || 0;
        el.textContent = 'Đã chặn phiên này: ' + seenCount + ' đã xem · ' + typCount + ' đang gõ';
    }

    function recordPrivacyBlock(kind, source) {
        if (kind === 'seen') {
            protocolVault.stats.blockedSeen++;
        } else {
            protocolVault.stats.blockedTyping++;
        }
        if (source) {
            if (source.indexOf('LS:') === 0 || source.indexOf('MAW') === 0 || source.indexOf('use') === 0 || source.indexOf('mod:') === 0) {
                if (kind === 'seen') protocolVault.stats.modSeenBlk++;
                else protocolVault.stats.modTypBlk++;
            } else if (source.indexOf('worker:') === 0) {
                protocolVault.stats.workerBlk++;
            } else if (source.indexOf('ws:') === 0) {
                if (kind === 'seen') protocolVault.stats.wsSeenBlk++;
                else protocolVault.stats.wsTypBlk++;
            } else if (source.indexOf('http:') === 0) {
                protocolVault.stats.httpBlk++;
            }
        }
        updatePrivacyStatsUi();
        const now = Date.now();
        if (privacyDiagBurstCount < 16 || now - lastPrivacyDiagTs >= 1800) {
            privacyDiagBurstCount++;
            lastPrivacyDiagTs = now;
            sendHost('DiagLog', {
                message:
                    '[Privacy Block] kind=' +
                    kind +
                    ' src=' +
                    String(source || 'unknown') +
                    ' seenBlk=' +
                    protocolVault.stats.blockedSeen +
                    ' typBlk=' +
                    protocolVault.stats.blockedTyping +
                    ' modHooks=' +
                    protocolVault.stats.modHooks,
            });
        }
    }

    const LS_INSERT_OPS = new Set([
        'insertMessage',
        'upsertMessage',
        'insertBlobAttachment',
        'insertXmaAttachment',
        'deltaNewMessage',
    ]);
    const LS_RECALL_OPS = new Set([
        'deleteThenInsertMessage',
        'deleteMessage',
        'markMessageUnsent',
        'updateMessageUnsentStatus',
        'removeMessage',
        'upsertUnsentMessage',
        'DeltaMessageDelete',
    ]);
    const MSG_ID_TOKEN_RE = /^(?:mid\.\$?[A-Za-z0-9_.:-]+|m_[A-Za-z0-9_.-]+)$/;

    function installErrorTelemetry() {
        let jsErrorCount = 0;
        function emitJsErr(prefix, detail) {
            if (jsErrorCount >= 10) return;
            jsErrorCount++;
            sendHost('DiagLog', {
                message: '[JS Error] ' + prefix + ': ' + String(detail || '').slice(0, 240),
            });
        }
        window.addEventListener('error', function (evt) {
            const msg = evt && (evt.message || (evt.error && evt.error.message) || 'error');
            const loc = evt && evt.filename ? ' @' + evt.lineno + ':' + evt.colno : '';
            emitJsErr('runtime', msg + loc);
        });
        window.addEventListener('unhandledrejection', function (evt) {
            const reason = evt && evt.reason ? (evt.reason.message || String(evt.reason)) : 'rejection';
            emitJsErr('promise', reason);
        });
    }

    function installBlobRevokeBlocker() {
        if (typeof MediaSource === 'function' && MediaSource.prototype) {
            const origAddSb = MediaSource.prototype.addSourceBuffer;
            if (typeof origAddSb === 'function') {
                MediaSource.prototype.addSourceBuffer = function (mimeType) {
                    const sb = origAddSb.apply(this, arguments);
                    try {
                        if (sb) {
                            sb.__n0Ms = this;
                            sb.__n0Mime = typeof mimeType === 'string' ? mimeType : '';
                        }
                        if (!mediaSourceChunks.has(this)) {
                            mediaSourceChunks.set(this, {
                                mime: typeof mimeType === 'string' ? mimeType : 'video/mp4',
                                parts: [],
                                totalBytes: 0,
                                createdUrl: '',
                            });
                            activeMediaSources.push(this);
                            while (activeMediaSources.length > MAX_MSE_STREAMS) {
                                const oldMs = activeMediaSources.shift();
                                if (oldMs) mediaSourceChunks.delete(oldMs);
                            }
                        }
                    } catch (_) {}
                    return sb;
                };
            }
            if (typeof SourceBuffer === 'function' && SourceBuffer.prototype && typeof SourceBuffer.prototype.appendBuffer === 'function') {
                const origAppend = SourceBuffer.prototype.appendBuffer;
                SourceBuffer.prototype.appendBuffer = function (data) {
                    try {
                        const ms = this.__n0Ms;
                        const rec = ms && mediaSourceChunks.get(ms);
                        if (antiRecallEnabled && rec && data) {
                            const byteLen = data.byteLength || 0;
                            if (byteLen > 0 && rec.totalBytes + byteLen <= MAX_MSE_BYTES_PER_STREAM) {
                                const copy = data instanceof ArrayBuffer
                                    ? new Uint8Array(data.slice(0))
                                    : ArrayBuffer.isView(data)
                                    ? new Uint8Array(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength))
                                    : null;
                                if (copy) {
                                    rec.parts.push(copy);
                                    rec.totalBytes += copy.byteLength;
                                    rec.createdUrl = '';
                                }
                            }
                        }
                    } catch (_) {}
                    return origAppend.apply(this, arguments);
                };
            }
        }

        const urlCtor = typeof URL === 'function' ? URL : null;
        if (!urlCtor || typeof urlCtor.createObjectURL !== 'function' || typeof urlCtor.revokeObjectURL !== 'function') {
            return;
        }
        const origCreate = urlCtor.createObjectURL;
        const origRevoke = urlCtor.revokeObjectURL;
        origUrlRevoke = origRevoke;

        urlCtor.createObjectURL = function (obj) {
            const url = origCreate.call(urlCtor, obj);
            try {
                const isMediaSource = typeof MediaSource === 'function' && obj instanceof MediaSource;
                if (isMediaSource) {
                    mediaSourceByUrl.set(url, obj);
                    while (mediaSourceByUrl.size > 12) {
                        const oldestMsKey = mediaSourceByUrl.keys().next();
                        if (oldestMsKey.done) break;
                        mediaSourceByUrl.delete(oldestMsKey.value);
                    }
                } else if (antiRecallEnabled && obj && typeof obj === 'object' && typeof obj.size === 'number') {
                    const mime = typeof obj.type === 'string' ? obj.type.toLowerCase() : '';
                    const isMediaMime = mime.startsWith('image/') || mime.startsWith('video/') || mime.startsWith('audio/');
                    const isGenericBinaryBlob =
                        (mime === '' || mime === 'application/octet-stream') &&
                        obj.size >= 256 &&
                        obj.size <= 95 * 1024 * 1024;
                    if (isMediaMime || isGenericBinaryBlob) {
                        protectedBlobMap.set(url, { blob: obj, size: obj.size, mime: mime, ts: Date.now() });
                        protectedBlobBytes += obj.size;
                        while (protectedBlobMap.size > MAX_PROTECTED_BLOBS || protectedBlobBytes > MAX_PROTECTED_BYTES) {
                            const oldest = protectedBlobMap.entries().next();
                            if (oldest.done) break;
                            const oldUrl = oldest.value[0];
                            const oldMeta = oldest.value[1];
                            protectedBlobMap.delete(oldUrl);
                            protectedBlobBytes = Math.max(0, protectedBlobBytes - (oldMeta ? oldMeta.size : 0));
                            try {
                                origRevoke.call(urlCtor, oldUrl);
                            } catch (_) {}
                        }
                    }
                }
            } catch (_) {}
            return url;
        };

        urlCtor.revokeObjectURL = function (url) {
            try {
                if (antiRecallEnabled && typeof url === 'string' && (protectedBlobMap.has(url) || mediaSourceByUrl.has(url))) {
                    protocolVault.stats.blockedRevokes++;
                    return;
                }
            } catch (_) {}
            return origRevoke.call(urlCtor, url);
        };
    }

    function scheduleAsyncAntiRecallScan() {
        Promise.resolve().then(function () {
            if (typeof scanAntiRecall === 'function') {
                scanAntiRecall();
            }
        });
    }

    function ingestProtocolMessage(info) {
        if (!info || !antiRecallEnabled) return;
        const media = Array.isArray(info.media) ? info.media : [];
        if (info.mediaUrl) {
            const mKind = info.mediaKind || (/\.(mp4|webm|mov)(\?|$)/i.test(info.mediaUrl) ? 'video' : 'image');
            media.push({
                kind: mKind,
                src: info.mediaUrl,
                fallbackUrl: info.mediaUrl,
                blobKey: info.mediaUrl.startsWith('blob:') ? info.mediaUrl : '',
                alt: mKind === 'video' ? 'Video đính kèm' : mKind === 'link' ? info.mediaUrl : 'Hình ảnh',
            });
        }
        const cleanText = typeof info.text === 'string' ? info.text.replace(/\s+/g, ' ').trim() : '';
        if (!isValidCapturedContent(cleanText, media)) return;

        const msgId = info.msgId ? String(info.msgId).trim() : '';
        const threadKey = info.threadKey ? String(info.threadKey).trim() : getCurrentThreadKey();
        const alignRight = typeof info.isOutgoing === 'boolean' ? info.isOutgoing : false;
        const sender = info.sender ? String(info.sender).trim() : (alignRight ? 'Bạn' : 'Người gửi');
        const entry = {
            id: msgId || 'pv_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
            msgId: msgId,
            fiberKey: msgId,
            threadKey: threadKey,
            sender: sender,
            text: cleanText,
            media: media,
            alignRight: alignRight,
            timeLabel: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
            capturedAt: Date.now(),
            source: 'protocol',
        };

        if (msgId) {
            const prev = protocolVault.byMsgId[msgId];
            if (prev) {
                if (cleanText) prev.text = cleanText;
                if (media.length > 0) prev.media = prev.media.length > 0 ? prev.media.concat(media) : media;
                if (info.sender) prev.sender = sender;
                if (typeof info.isOutgoing === 'boolean') prev.alignRight = alignRight;
                prev.capturedAt = Date.now();
            } else {
                protocolVault.byMsgId[msgId] = entry;
            }
        }

        protocolVault.recentList.push(entry);
        if (protocolVault.recentList.length > 200) {
            protocolVault.recentList = protocolVault.recentList.slice(-200);
        }
        const vaultKeys = Object.keys(protocolVault.byMsgId);
        if (vaultKeys.length > 240) {
            for (let i = 0; i < vaultKeys.length - 240; i++) {
                delete protocolVault.byMsgId[vaultKeys[i]];
            }
        }

        if (msgId && protocolVault.recalledById[msgId] && !protocolVault.recalledById[msgId].text && cleanText) {
            protocolVault.recalledById[msgId] = entry;
            scheduleAsyncAntiRecallScan();
        }
    }

    function flagProtocolRecall(msgId, threadKey) {
        if (!msgId || !antiRecallEnabled) return;
        const idStr = String(msgId).trim();
        if (!idStr) return;

        let captured = protocolVault.byMsgId[idStr] || null;
        if (!captured && typeof threadLedgers === 'object') {
            const tk = threadKey ? String(threadKey) : getCurrentThreadKey();
            const st = threadLedgers[tk];
            if (st && st.byMsgId && st.byMsgId[idStr]) {
                captured = st.byMsgId[idStr];
            } else {
                const allKeys = Object.keys(threadLedgers);
                for (let i = 0; i < allKeys.length; i++) {
                    const s = threadLedgers[allKeys[i]];
                    if (s && s.byMsgId && s.byMsgId[idStr]) {
                        captured = s.byMsgId[idStr];
                        break;
                    }
                }
            }
        }

        if (captured && isValidCapturedContent(captured.text, captured.media)) {
            if (!protocolVault.recalledById[idStr]) {
                protocolVault.recalledById[idStr] = captured;
                protocolVault.stats.recallsCaught++;
                protocolVault.recalledQueue.push({
                    msgId: idStr,
                    threadKey: captured.threadKey || (threadKey ? String(threadKey) : getCurrentThreadKey()),
                    record: captured,
                    recalledAt: Date.now(),
                });
                if (protocolVault.recalledQueue.length > 40) {
                    protocolVault.recalledQueue = protocolVault.recalledQueue.slice(-40);
                }
            }
            scheduleAsyncAntiRecallScan();
        }
    }

    function walkLsPayload(val, depth) {
        if (!val || depth > 14) return;
        if (typeof val === 'string') {
            const s = val.trim();
            if (s.length > 2 && (s[0] === '{' || s[0] === '[')) {
                try {
                    walkLsPayload(JSON.parse(s), depth + 1);
                } catch (_) {}
            }
            return;
        }
        if (typeof val !== 'object') return;

        if (Array.isArray(val)) {
            let opIdx = -1;
            let opName = '';
            for (let k = 0; k < Math.min(2, val.length); k++) {
                if (typeof val[k] === 'string' && (LS_INSERT_OPS.has(val[k]) || LS_RECALL_OPS.has(val[k]))) {
                    opIdx = k;
                    opName = val[k];
                    break;
                }
            }

            if (opIdx !== -1) {
                let foundMsgId = '';
                let foundText = '';
                let foundMediaUrl = '';
                let foundThread = '';
                for (let i = opIdx + 1; i < val.length; i++) {
                    const item = val[i];
                    if (typeof item === 'string') {
                        const s = item.trim();
                        if (!s) continue;
                        if (!foundMsgId && (MSG_ID_TOKEN_RE.test(s) || (LS_RECALL_OPS.has(opName) && s.length >= 4 && s.length <= 128 && !/\s/.test(s)))) {
                            foundMsgId = s;
                        } else if (!foundMediaUrl && /^https?:\/\//i.test(s)) {
                            const unwrapped = unwrapMessageLinkUrl(s);
                            if (unwrapped) foundMediaUrl = unwrapped;
                        } else if (!foundText && !/^\d+$/.test(s) && !LS_INSERT_OPS.has(s) && !LS_RECALL_OPS.has(s) && isValidCapturedContent(s, [])) {
                            foundText = s;
                        }
                    } else if (item && typeof item === 'object' && !Array.isArray(item)) {
                        const objId = item.messageId || item.mid || item.offlineThreadingId || item.message_id;
                        if (!foundMsgId && objId) foundMsgId = String(objId);
                        if (!foundThread && (item.threadKey || item.threadId)) foundThread = String(item.threadKey || item.threadId);
                        const objTxt = item.text || item.body || item.plaintext;
                        if (!foundText && typeof objTxt === 'string' && isValidCapturedContent(objTxt, [])) foundText = objTxt;
                    }
                }
                if (LS_INSERT_OPS.has(opName) && (foundText || foundMediaUrl)) {
                    ingestProtocolMessage({
                        msgId: foundMsgId,
                        text: foundText,
                        mediaUrl: foundMediaUrl,
                        mediaKind: opName === 'insertXmaAttachment' ? 'link' : '',
                        threadKey: foundThread,
                    });
                } else if (LS_RECALL_OPS.has(opName) && foundMsgId) {
                    flagProtocolRecall(foundMsgId, foundThread);
                }
            }

            for (let i = 0; i < val.length; i++) {
                if (val[i] && typeof val[i] === 'object' || (typeof val[i] === 'string' && val[i].length > 2 && (val[i][0] === '{' || val[i][0] === '['))) {
                    walkLsPayload(val[i], depth + 1);
                }
            }
            return;
        }

        const msgId = val.messageId || val.mid || val.offlineThreadingId || val.message_id || val.id_str || '';
        const threadKey = val.threadKey || val.thread_id || val.threadId || '';
        const textVal = val.text || val.body || val.plaintext || val.snippet || (typeof val.message === 'string' ? val.message : '');
        const isUnsent =
            val.isUnsent === true ||
            val.deleted === true ||
            Number(val.unsentTimestampMs) > 0 ||
            Number(val.unsentStatus) > 0 ||
            (typeof textVal === 'string' && isUnsentTombstoneText(textVal));

        if (msgId) {
            if (isUnsent) {
                flagProtocolRecall(msgId, threadKey);
            } else {
                const mediaUrl =
                    val.playable_url_quality_hd ||
                    val.playable_url ||
                    val.playableUrl ||
                    val.video_url ||
                    val.videoUrl ||
                    val.targetUrl ||
                    val.target_url ||
                    '';
                const cleanProtoLink = mediaUrl && /^https?:/i.test(String(mediaUrl)) ? unwrapMessageLinkUrl(String(mediaUrl)) : '';
                const looksLikeVideo = !!(val.playable_url_quality_hd || val.playable_url || val.playableUrl || val.video_url || val.videoUrl);
                if (
                    (typeof textVal === 'string' && isValidCapturedContent(textVal, [])) ||
                    cleanProtoLink
                ) {
                    const isOut = typeof val.isOutgoing === 'boolean' ? val.isOutgoing : (typeof val.outgoing === 'boolean' ? val.outgoing : undefined);
                    ingestProtocolMessage({
                        msgId: msgId,
                        text: typeof textVal === 'string' ? textVal : '',
                        mediaUrl: cleanProtoLink,
                        mediaKind: looksLikeVideo ? 'video' : (cleanProtoLink ? 'link' : ''),
                        sender: val.senderName || val.authorName || '',
                        threadKey: threadKey,
                        isOutgoing: isOut,
                    });
                }
            }
        }

        const keys = Object.keys(val);
        for (let i = 0; i < keys.length; i++) {
            const child = val[keys[i]];
            if (child && typeof child === 'object') {
                walkLsPayload(child, depth + 1);
            } else if (typeof child === 'string' && child.length > 2 && (child[0] === '{' || child[0] === '[')) {
                walkLsPayload(child, depth + 1);
            }
        }
    }

    function parseAndInspectJsonSegments(rawStr) {
        if (!rawStr || typeof rawStr !== 'string') return;
        let idx = 0;
        let attempts = 0;
        while (idx < rawStr.length && attempts < 12) {
            const objPos = rawStr.indexOf('{', idx);
            const arrPos = rawStr.indexOf('[', idx);
            let start = -1;
            if (objPos !== -1 && arrPos !== -1) start = Math.min(objPos, arrPos);
            else start = objPos !== -1 ? objPos : arrPos;
            if (start === -1) break;

            const tail = rawStr.slice(start);
            try {
                const parsed = JSON.parse(tail);
                walkLsPayload(parsed, 0);
                break;
            } catch (_) {
                // Thử tách JSON hoàn chỉnh bằng đếm ngoặc nhọn/vuông nếu có nhiều frame ghép nối
                const openCh = rawStr[start];
                const closeCh = openCh === '{' ? '}' : ']';
                let depth = 0;
                let inString = false;
                let escaped = false;
                let end = -1;
                for (let p = start; p < rawStr.length; p++) {
                    const ch = rawStr[p];
                    if (escaped) {
                        escaped = false;
                        continue;
                    }
                    if (ch === '\\' && inString) {
                        escaped = true;
                        continue;
                    }
                    if (ch === '"') {
                        inString = !inString;
                        continue;
                    }
                    if (inString) continue;
                    if (ch === openCh) depth++;
                    else if (ch === closeCh) {
                        depth--;
                        if (depth === 0) {
                            end = p;
                            break;
                        }
                    }
                }
                if (end !== -1) {
                    try {
                        walkLsPayload(JSON.parse(rawStr.slice(start, end + 1)), 0);
                    } catch (_) {}
                    idx = end + 1;
                } else {
                    idx = start + 1;
                }
                attempts++;
            }
        }
    }

    function inspectRawNetworkData(data) {
        if (!antiRecallEnabled || data == null) return;
        try {
            if (typeof data === 'string') {
                parseAndInspectJsonSegments(data);
                return;
            }
            if (typeof TextDecoder === 'function') {
                if (data instanceof ArrayBuffer || ArrayBuffer.isView(data)) {
                    const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
                    if (bytes.byteLength === 0 || bytes.byteLength > 2 * 1024 * 1024) return;
                    const decoded = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
                    parseAndInspectJsonSegments(decoded);
                    return;
                }
            }
            if (typeof Blob === 'function' && data instanceof Blob && data.size > 0 && data.size <= 2 * 1024 * 1024 && typeof data.arrayBuffer === 'function') {
                data.arrayBuffer().then(function (buf) {
                    inspectRawNetworkData(buf);
                }).catch(function () {});
            }
        } catch (_) {}
    }

    function decodeMqttVarint(bytes, startOffset) {
        let multiplier = 1;
        let value = 0;
        let offset = startOffset;
        for (let i = 0; i < 4 && offset < bytes.length; i++) {
            const encoded = bytes[offset++];
            value += (encoded & 127) * multiplier;
            if ((encoded & 128) === 0) {
                return { value: value, nextOffset: offset, ok: true };
            }
            multiplier *= 128;
        }
        return { value: 0, nextOffset: startOffset, ok: false };
    }

    function encodeMqttVarint(len) {
        const out = [];
        let x = len;
        do {
            let digit = x % 128;
            x = Math.floor(x / 128);
            if (x > 0) digit = digit | 128;
            out.push(digit);
        } while (x > 0);
        return out;
    }

    function decodeBytesUtf8(bytes) {
        if (!bytes || bytes.byteLength === 0) return '';
        if (typeof TextDecoder === 'function') {
            return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
        }
        let s = '';
        for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
        return s;
    }

    function encodeStringUtf8(str) {
        if (typeof TextEncoder === 'function') {
            return new TextEncoder().encode(str);
        }
        const raw = unescape(encodeURIComponent(str));
        const arr = new Uint8Array(raw.length);
        for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
        return arr;
    }

    function parseMqttPublishPacket(bytes) {
        if (!bytes || bytes.length < 4 || (bytes[0] & 0xf0) !== 0x30) return null;
        const qos = (bytes[0] >> 1) & 0x03;
        const vr = decodeMqttVarint(bytes, 1);
        if (!vr.ok || vr.nextOffset + 2 > bytes.length) return null;
        let pos = vr.nextOffset;
        const topicLen = (bytes[pos] << 8) | bytes[pos + 1];
        pos += 2;
        if (pos + topicLen > bytes.length) return null;
        const topicBytes = bytes.subarray(pos, pos + topicLen);
        const topic = decodeBytesUtf8(topicBytes);
        pos += topicLen;
        let pktHi = 0;
        let pktLo = 0;
        if (qos > 0) {
            if (pos + 2 > bytes.length) return null;
            pktHi = bytes[pos];
            pktLo = bytes[pos + 1];
            pos += 2;
        }
        return {
            firstByte: bytes[0],
            qos: qos,
            topic: topic,
            topicBytes: topicBytes,
            pktHi: pktHi,
            pktLo: pktLo,
            payloadBytes: bytes.subarray(pos),
        };
    }

    function rebuildMqttPublishPacket(parsed, newPayloadBytes) {
        const varHeaderLen = 2 + parsed.topicBytes.length + (parsed.qos > 0 ? 2 : 0);
        const remLen = encodeMqttVarint(varHeaderLen + newPayloadBytes.length);
        const out = new Uint8Array(1 + remLen.length + varHeaderLen + newPayloadBytes.length);
        let p = 0;
        out[p++] = parsed.firstByte;
        for (let i = 0; i < remLen.length; i++) out[p++] = remLen[i];
        out[p++] = (parsed.topicBytes.length >> 8) & 0xff;
        out[p++] = parsed.topicBytes.length & 0xff;
        out.set(parsed.topicBytes, p);
        p += parsed.topicBytes.length;
        if (parsed.qos > 0) {
            out[p++] = parsed.pktHi & 0xff;
            out[p++] = parsed.pktLo & 0xff;
        }
        out.set(newPayloadBytes, p);
        return out.buffer;
    }

    const wsTrackedListeners = new WeakMap();
    function ackDroppedQos1(wsInstance, qos, pktHi, pktLo) {
        if (qos !== 1 || !wsInstance) return;
        const pubackBuf = new Uint8Array([0x40, 0x02, pktHi & 0xff, pktLo & 0xff]).buffer;
        Promise.resolve().then(function () {
            try {
                if (typeof MessageEvent === 'function' && typeof wsInstance.dispatchEvent === 'function') {
                    wsInstance.dispatchEvent(new MessageEvent('message', { data: pubackBuf }));
                    return;
                }
            } catch (_) {}
            try {
                if (typeof wsInstance.onmessage === 'function') {
                    wsInstance.onmessage({ data: pubackBuf });
                }
                const fns = wsTrackedListeners.get(wsInstance);
                if (Array.isArray(fns)) {
                    for (let i = 0; i < fns.length; i++) {
                        try {
                            fns[i].call(wsInstance, { data: pubackBuf });
                        } catch (_) {}
                    }
                }
            } catch (_) {}
        });
    }

    const LS_PROTECTED_RE = /(send_message|sendMessage|insertAttachment|attachment_fbids|"otid"\s*:|offline_threading_id|upload|media_id|xma|unsend|deleteMessage|delete_message|reaction|e2ee_key)/i;
    const LS_SEEN_QN_RE = /(?:^|_|\.)(mark_read|mark_thread_read|read_receipt|mrq|mark_seen)(?:$|_|\.)/i;
    const LS_SEEN_PL_RE = /(markThreadRead|markRead|sendReadReceipt|MarkThreadAsRead|updateReadReceipt|mark_thread_read|last_read_watermark_ts|markBumpedThreadsSeen|markFolderSeen)/i;
    const LS_TYPING_QN_RE = /(?:^|_|\.)(typing|orca_typing|typing_indicator|thread_typing)(?:$|_|\.)/i;
    const LS_TYPING_PL_RE = /(sendTypingIndicator|TypingIndicator|issueTypingState|typing_attribution|sendChatState)/i;
    const TYPING_TOPICS = new Set(['/t_tp', '/t_stp', '/orca_typing_notifications', '/typing', '/ls_typing']);

    function filterOutboundWsData(wsInstance, data) {
        if (!featureState.blockSeen && !featureState.blockTyping) {
            return { action: 'pass', data: data };
        }
        if (typeof data === 'string') {
            if (
                featureState.blockTyping &&
                !LS_PROTECTED_RE.test(data) &&
                /(?:"topic"\s*:\s*"\/(?:t_tp|t_stp|orca_typing_notifications)"|\\?"is_typing\\?"\s*:\s*(?:true|1))/i.test(data)
            ) {
                recordPrivacyBlock('typing', 'ws:text_frame');
                return { action: 'drop' };
            }
            return { action: 'pass', data: data };
        }
        if (!(data instanceof ArrayBuffer) && !ArrayBuffer.isView(data)) {
            return { action: 'pass', data: data };
        }
        const bytes = data instanceof ArrayBuffer
            ? new Uint8Array(data)
            : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
        const parsed = parseMqttPublishPacket(bytes);
        if (!parsed) return { action: 'pass', data: data };

        if (featureState.blockTyping && TYPING_TOPICS.has(parsed.topic)) {
            recordPrivacyBlock('typing', 'ws:topic:' + parsed.topic);
            ackDroppedQos1(wsInstance, parsed.qos, parsed.pktHi, parsed.pktLo);
            return { action: 'drop' };
        }

        if (parsed.topic === '/ls_req') {
            const rawJson = decodeBytesUtf8(parsed.payloadBytes);
            const startIdx = rawJson.indexOf('{');
            if (startIdx === -1) return { action: 'pass', data: data };
            let outer;
            try {
                outer = JSON.parse(rawJson.slice(startIdx));
            } catch (_) {
                return { action: 'pass', data: data };
            }
            if (!outer || typeof outer !== 'object' || typeof outer.payload !== 'string') {
                return { action: 'pass', data: data };
            }
            const plTrim = outer.payload.trim();
            if (plTrim.charAt(0) === '{') {
                let inner;
                try {
                    inner = JSON.parse(plTrim);
                } catch (_) {
                    inner = null;
                }
                if (inner && Array.isArray(inner.tasks) && inner.tasks.length > 0) {
                    const kept = [];
                    let droppedAny = false;
                    for (let i = 0; i < inner.tasks.length; i++) {
                        const t = inner.tasks[i];
                        if (!t || typeof t !== 'object') {
                            kept.push(t);
                            continue;
                        }
                        const label = String(t.label != null ? t.label : '');
                        const qn = Array.isArray(t.queue_name)
                            ? t.queue_name.join('_')
                            : String(t.queue_name != null ? t.queue_name : '');
                        const pl = typeof t.payload === 'string' ? t.payload : JSON.stringify(t.payload || '');
                        const isProtected =
                            label === '46' ||
                            LS_PROTECTED_RE.test(qn) ||
                            LS_PROTECTED_RE.test(pl);
                        if (isProtected) {
                            kept.push(t);
                            continue;
                        }
                        const isSeen =
                            label === '21' ||
                            pl.indexOf('last_read_watermark_ts') !== -1 ||
                            LS_SEEN_QN_RE.test(qn) ||
                            LS_SEEN_PL_RE.test(pl);
                        const isTyping =
                            label === '3' ||
                            pl.indexOf('"is_typing"') !== -1 ||
                            LS_TYPING_QN_RE.test(qn) ||
                            LS_TYPING_PL_RE.test(pl);
                        if (featureState.blockSeen && isSeen) {
                            recordPrivacyBlock('seen', 'ws:ls_req:task' + (label || 'seen'));
                            droppedAny = true;
                            continue;
                        }
                        if (featureState.blockTyping && isTyping) {
                            recordPrivacyBlock('typing', 'ws:ls_req:task' + (label || 'typ'));
                            droppedAny = true;
                            continue;
                        }
                        kept.push(t);
                    }
                    if (!droppedAny) return { action: 'pass', data: data };
                    if (kept.length === 0) {
                        ackDroppedQos1(wsInstance, parsed.qos, parsed.pktHi, parsed.pktLo);
                        return { action: 'drop' };
                    }
                    const nextInner = Object.assign({}, inner, { tasks: kept });
                    const nextOuter = Object.assign({}, outer, { payload: JSON.stringify(nextInner) });
                    const newJsonBytes = encodeStringUtf8(JSON.stringify(nextOuter));
                    return { action: 'replace', data: rebuildMqttPublishPacket(parsed, newJsonBytes) };
                } else if (inner && typeof inner === 'object') {
                    const rootLabel = String(inner.label != null ? inner.label : '');
                    const rootQn = Array.isArray(inner.queue_name)
                        ? inner.queue_name.join('_')
                        : String(inner.queue_name != null ? inner.queue_name : '');
                    const rootPl = typeof inner.payload === 'string' ? inner.payload : JSON.stringify(inner);
                    if (rootLabel !== '46' && !LS_PROTECTED_RE.test(rootQn) && !LS_PROTECTED_RE.test(rootPl)) {
                        const rootIsSeen =
                            rootLabel === '21' ||
                            rootPl.indexOf('last_read_watermark_ts') !== -1 ||
                            LS_SEEN_QN_RE.test(rootQn) ||
                            LS_SEEN_PL_RE.test(rootPl);
                        const rootIsTyping =
                            rootLabel === '3' ||
                            rootPl.indexOf('"is_typing"') !== -1 ||
                            LS_TYPING_QN_RE.test(rootQn) ||
                            LS_TYPING_PL_RE.test(rootPl);
                        if (featureState.blockSeen && rootIsSeen) {
                            recordPrivacyBlock('seen', 'ws:ls_req:root' + (rootLabel || 'seen'));
                            ackDroppedQos1(wsInstance, parsed.qos, parsed.pktHi, parsed.pktLo);
                            return { action: 'drop' };
                        }
                        if (featureState.blockTyping && rootIsTyping) {
                            recordPrivacyBlock('typing', 'ws:ls_req:root' + (rootLabel || 'typ'));
                            ackDroppedQos1(wsInstance, parsed.qos, parsed.pktHi, parsed.pktLo);
                            return { action: 'drop' };
                        }
                    }
                }
            }
            if (!LS_PROTECTED_RE.test(outer.payload)) {
                if (
                    featureState.blockTyping &&
                    /(sendTypingIndicator|issueTypingState|\\?"is_typing\\?"\s*:\s*(?:true|1|0)|\\?"label\\?"\s*:\s*\\?"3\\?")/i.test(outer.payload)
                ) {
                    recordPrivacyBlock('typing', 'ws:ls_req:raw_typ');
                    ackDroppedQos1(wsInstance, parsed.qos, parsed.pktHi, parsed.pktLo);
                    return { action: 'drop' };
                }
                if (
                    featureState.blockSeen &&
                    /(\\?"last_read_watermark_ts\\?"|\\?"label\\?"\s*:\s*\\?"21\\?")/i.test(outer.payload)
                ) {
                    recordPrivacyBlock('seen', 'ws:ls_req:raw_seen');
                    ackDroppedQos1(wsInstance, parsed.qos, parsed.pktHi, parsed.pktLo);
                    return { action: 'drop' };
                }
            }
        }
        return { action: 'pass', data: data };
    }

    function extractRequestBodyString(body) {
        if (!body) return '';
        if (typeof body === 'string') return body;
        try {
            if (typeof URLSearchParams === 'function' && body instanceof URLSearchParams) {
                return body.toString();
            }
            if (typeof FormData === 'function' && body instanceof FormData && typeof body.forEach === 'function') {
                const pairs = [];
                body.forEach(function (v, k) {
                    if (typeof v === 'string' && pairs.length < 40) pairs.push(k + '=' + v);
                });
                return pairs.join('&');
            }
            if (body instanceof ArrayBuffer || ArrayBuffer.isView(body)) {
                const bytes = body instanceof ArrayBuffer
                    ? new Uint8Array(body)
                    : new Uint8Array(body.buffer, body.byteOffset, body.byteLength);
                if (bytes.byteLength > 0 && bytes.byteLength <= 16384) {
                    return decodeBytesUtf8(bytes);
                }
            }
        } catch (_) {}
        return '';
    }

    function shouldBlockHttpPrivacyRequest(urlStr, bodyStr) {
        const u = String(urlStr || '').toLowerCase();
        const b = String(bodyStr || '');
        if (/(SendMessage|send_message|Unsend|DeleteMessage)/i.test(b)) return '';
        if (featureState.blockSeen) {
            if (
                u.indexOf('/change_read_status.php') !== -1 ||
                u.indexOf('/mark_seen.php') !== -1 ||
                u.indexOf('/mark_read.php') !== -1
            ) {
                return 'seen';
            }
            if (
                u.indexOf('/api/graphql') !== -1 &&
                /(MarkRead|MarkThreadRead|MarkThreadAsRead|ReadReceipt|ThreadMarkRead|MarkFolderSeen|MarkBumpedThreadsSeen)/i.test(b)
            ) {
                return 'seen';
            }
        }
        if (featureState.blockTyping) {
            if (u.indexOf('/messaging/typ.php') !== -1 || u.indexOf('/mercury/typ.php') !== -1) {
                return 'typing';
            }
            if (
                u.indexOf('/api/graphql') !== -1 &&
                /(TypingIndicator|SendTyping|ThreadTyping|ChatStateComposing|UpdateTyping)/i.test(b)
            ) {
                return 'typing';
            }
        }
        return '';
    }

    // ================= LAYER 1: META AMD MODULE LOADER (window.__d) PRIVACY HOOKS =================
    // Lưu ý quan trọng: Chỉ chặn chiều GỬI ĐI (LSMark*, LSOptimisticMark*, LSSend*, LSIssue*, markThreadAsRead, sendChatState).
    // Tuyệt đối KHÔNG chặn LSUpdateReadReceipt / LSUpdateTypingIndicator vì đó là hàm ghi DB cục bộ khi NHẬN trạng thái từ đối phương!
    const LS_SEEN_MODULES = new Set([
        'LSOptimisticMarkThreadReadV2',
        'LSOptimisticMarkThreadRead',
        'LSMarkThreadRead',
        'LSMarkThreadReadV2',
        'LSMarkBumpedThreadsSeen',
        'LSMarkBumpedThreadsSeenStoredProcedure',
        'LSMarkFolderSeen',
        'LSMarkFolderSeenStoredProcedure',
        'LSSendReadReceipt',
        'LSMarkThreadReadStoredProcedure',
    ]);
    const LS_TYPING_MODULES = new Set([
        'LSSendTypingIndicator',
        'LSSendTypingIndicatorV2',
        'LSSendTypingIndicatorStoredProcedure',
        'LSIssueNewTypingState',
        'LSIssueTypingState',
    ]);
    const MAW_JOBS_MODULES = new Set(['MAWJobDefinitions', 'WAJobDefinitions']);
    const MAW_READ_HOOK_MODULES = new Set([
        'useMAWMarkThreadAsRead',
        'useMWLSMarkThreadAsRead',
        'useMWPMarkThreadAsRead',
        'useMWChatMarkThreadRead',
        'MWLSMarkThreadRead',
        'MWPMarkThreadRead',
        'MWChatMarkThreadRead',
    ]);
    const MAW_BRIDGE_MODULES = new Set(['MAWBridge', 'MAWWorkerBridge', 'MAWBackendBridge']);
    const TYPING_STATE_MODULES = new Set([
        'MAWSecureTypingState',
        'MAWTypingState',
        'MAWChatState',
        'MWLSTypingState',
        'MWLSTypingIndicator',
        'MWPTypingIndicator',
        'MWChatTyping',
        'MWChatTypingIndicator',
        'MWComposerTyping',
        'CometMWPTypingIndicator',
        'MessengerTypingIndicator',
        'MWPUseTypingIndicator',
    ]);

    const LS_RECALL_INSERT_MODULES = new Set([
        'LSInsertMessage',
        'LSInsertMessageStoredProcedure',
        'LSUpsertMessage',
        'LSUpsertMessageStoredProcedure',
    ]);
    const LS_RECALL_UNSEND_MODULES = new Set([
        'LSDeleteThenInsertMessage',
        'LSDeleteThenInsertMessageStoredProcedure',
        'LSMarkMessageUnsent',
        'LSMarkMessageUnsentStoredProcedure',
        'LSUpdateMessageUnsentStatus',
        'LSUpdateMessageUnsentStatusStoredProcedure',
        'LSDeleteMessage',
        'LSDeleteMessageStoredProcedure',
    ]);

    function classifyMetaPrivacyModule(name) {
        if (!name || typeof name !== 'string') return '';
        if (LS_RECALL_INSERT_MODULES.has(name)) return 'ls_recall_insert';
        if (LS_RECALL_UNSEND_MODULES.has(name)) return 'ls_recall_unsend';
        if (/^LSUpdate/i.test(name)) return '';
        if (LS_SEEN_MODULES.has(name)) return 'ls_seen';
        if (LS_TYPING_MODULES.has(name)) return 'ls_typing';
        if (MAW_JOBS_MODULES.has(name)) return 'maw_jobs';
        if (MAW_READ_HOOK_MODULES.has(name)) return 'maw_read_hook';
        if (MAW_BRIDGE_MODULES.has(name)) return 'maw_bridge';
        if (TYPING_STATE_MODULES.has(name)) return 'typing_mod';
        if (/^LS(?:Optimistic)?(?:MarkThread.*Read|MarkBumpedThreadsSeen|MarkFolderSeen|SendReadReceipt)/i.test(name)) {
            return 'ls_seen';
        }
        if (/^LS(?:SendTypingIndicator|Issue.*Typing)/i.test(name)) {
            return 'ls_typing';
        }
        if (/^(?:MAW|WA).*JobDefinitions$/i.test(name)) {
            return 'maw_jobs';
        }
        if (/^(?:use)?(?:MAW|MWLS|MWP?|Comet).*(?:MarkThread.*Read|MarkChat.*Read)$/i.test(name)) {
            return 'maw_read_hook';
        }
        if (/^(?:use)?(?:MAW|MWLS|MWP?|MWComposer|Comet).*(?:TypingState|TypingIndicator|SendTyping|ComposerTyping|ChatState)$/i.test(name)) {
            return 'typing_mod';
        }
        return '';
    }

    function copyMetaFnProps(origFn, wrappedFn) {
        if (typeof origFn !== 'function' || typeof wrappedFn !== 'function') return wrappedFn;
        try {
            const keys = Object.getOwnPropertyNames(origFn);
            for (let i = 0; i < keys.length; i++) {
                const k = keys[i];
                if (k === 'length' || k === 'name' || k === 'prototype' || k === 'arguments' || k === 'caller') continue;
                const desc = Object.getOwnPropertyDescriptor(origFn, k);
                if (desc) {
                    try {
                        Object.defineProperty(wrappedFn, k, desc);
                    } catch (_) {}
                }
            }
        } catch (_) {}
        try {
            Object.defineProperty(wrappedFn, '__n0Wrapped', { value: true, configurable: true });
        } catch (_) {
            wrappedFn.__n0Wrapped = true;
        }
        return wrappedFn;
    }

    const patchedMawBridges = typeof WeakSet === 'function' ? new WeakSet() : null;

    function patchMawBridgeInstance(bridge) {
        if (!bridge || (typeof bridge !== 'object' && typeof bridge !== 'function')) return bridge;
        if (patchedMawBridges) {
            if (patchedMawBridges.has(bridge)) return bridge;
            patchedMawBridges.add(bridge);
        } else if (bridge.__n0BridgePatched) {
            return bridge;
        } else {
            bridge.__n0BridgePatched = true;
        }
        const bridgeMethods = ['fireAndForget', 'sendAndReceive'];
        for (let m = 0; m < bridgeMethods.length; m++) {
            const mName = bridgeMethods[m];
            const origMethod = bridge[mName];
            if (typeof origMethod !== 'function' || origMethod.__n0Wrapped) continue;
            const wrappedMethod = function () {
                const arg0 = typeof arguments[0] === 'string' ? arguments[0] : '';
                const arg1 = typeof arguments[1] === 'string' ? arguments[1] : '';
                const op = arg1 || arg0;
                if (op && !/^(sendText|sendMedia|sendMsg|sendMessage|sendReaction|unsend|revoke|delete|sync|init|open|decrypt|encrypt|fetch|load|get|query)/i.test(op)) {
                    if (
                        featureState.blockSeen &&
                        /(markThreadAsRead|markChatAsRead|markAsRead|markRead|sendReadReceipt)/i.test(op)
                    ) {
                        recordPrivacyBlock('seen', 'MAWBridge:' + op);
                        return Promise.resolve();
                    }
                    if (
                        featureState.blockTyping &&
                        /(sendChatState|sendTyping|sendTypingState|sendTypingIndicator|sendComposing|chatStateComposing)/i.test(op)
                    ) {
                        recordPrivacyBlock('typing', 'MAWBridge:' + op);
                        return Promise.resolve();
                    }
                }
                return origMethod.apply(this, arguments);
            };
            try {
                bridge[mName] = copyMetaFnProps(origMethod, wrappedMethod);
            } catch (_) {}
        }
        return bridge;
    }

    function wrapMetaModuleFactory(moduleName, kind, origFactory) {
        if (typeof origFactory !== 'function' || origFactory.__n0FactoryWrapped) return origFactory;

        function makeLsSeenWrapper(origFn, srcTag) {
            if (typeof origFn !== 'function' || origFn.__n0Wrapped) return origFn;
            return copyMetaFnProps(origFn, function () {
                if (!featureState.blockSeen) return origFn.apply(this, arguments);
                recordPrivacyBlock('seen', srcTag);
                const lastArg = arguments.length > 0 ? arguments[arguments.length - 1] : null;
                if (lastArg && typeof lastArg === 'object' && typeof lastArg.resolve === 'function') {
                    return lastArg.resolve([]);
                }
                return undefined;
            });
        }

        function makeLsTypingWrapper(origFn, srcTag) {
            if (typeof origFn !== 'function' || origFn.__n0Wrapped) return origFn;
            return copyMetaFnProps(origFn, function () {
                if (!featureState.blockTyping) return origFn.apply(this, arguments);
                recordPrivacyBlock('typing', srcTag);
                const lastArg = arguments.length > 0 ? arguments[arguments.length - 1] : null;
                if (lastArg && typeof lastArg === 'object' && typeof lastArg.resolve === 'function') {
                    return lastArg.resolve([]);
                }
                return undefined;
            });
        }

        function makeReadHookOrActionWrapper(origFn, exportKey, srcTag) {
            if (typeof origFn !== 'function' || origFn.__n0Wrapped) return origFn;
            const isHook =
                /^use[A-Z_]/i.test(exportKey) ||
                ((exportKey === 'default' || exportKey === 'exports') && /^use[A-Z_]/i.test(moduleName));
            if (isHook) {
                return copyMetaFnProps(origFn, function () {
                    const res = origFn.apply(this, arguments);
                    if (typeof res === 'function') {
                        return function () {
                            if (featureState.blockSeen) {
                                recordPrivacyBlock('seen', srcTag);
                                return Promise.resolve();
                            }
                            return res.apply(this, arguments);
                        };
                    }
                    return res;
                });
            }
            return copyMetaFnProps(origFn, function () {
                if (featureState.blockSeen) {
                    recordPrivacyBlock('seen', srcTag);
                    return Promise.resolve();
                }
                return origFn.apply(this, arguments);
            });
        }

        function makeTypingExportWrapper(origFn, exportKey, srcTag) {
            if (typeof origFn !== 'function' || origFn.__n0Wrapped) return origFn;
            if (/(Peer|Incoming|Participant|Other|Observer)/i.test(exportKey)) return origFn;
            const isHook =
                /^use[A-Z_]/i.test(exportKey) ||
                ((exportKey === 'default' || exportKey === 'exports') && /^use[A-Z_]/i.test(moduleName));
            if (isHook) {
                return copyMetaFnProps(origFn, function () {
                    const res = origFn.apply(this, arguments);
                    if (typeof res === 'function') {
                        return function () {
                            if (featureState.blockTyping) {
                                recordPrivacyBlock('typing', srcTag);
                                return undefined;
                            }
                            return res.apply(this, arguments);
                        };
                    }
                    if (Array.isArray(res) && typeof res[1] === 'function') {
                        const origSetter = res[1];
                        const nextTuple = res.slice();
                        nextTuple[1] = function () {
                            if (featureState.blockTyping) {
                                recordPrivacyBlock('typing', srcTag);
                                return undefined;
                            }
                            return origSetter.apply(this, arguments);
                        };
                        return nextTuple;
                    }
                    return res;
                });
            }
            if (
                /^(send|update|notify|start|emit|issue).*(?:Typing|ChatState|Composing)/i.test(exportKey) ||
                ((exportKey === 'default' || exportKey === 'exports') && /(?:SendTyping|TypingIndicator|ChatState)/i.test(moduleName))
            ) {
                return copyMetaFnProps(origFn, function () {
                    if (featureState.blockTyping) {
                        recordPrivacyBlock('typing', srcTag);
                        return Promise.resolve();
                    }
                    return origFn.apply(this, arguments);
                });
            }
            return origFn;
        }

        const wrappedFactory = function () {
            const ret = origFactory.apply(this, arguments);
            try {
                let moduleObj = null;
                for (let i = arguments.length - 1; i >= 0; i--) {
                    const a = arguments[i];
                    if (a && typeof a === 'object' && Object.prototype.hasOwnProperty.call(a, 'exports')) {
                        moduleObj = a;
                        break;
                    }
                }
                const exportsObj =
                    moduleObj && moduleObj.exports != null
                        ? moduleObj.exports
                        : arguments.length > 0
                        ? arguments[arguments.length - 1]
                        : null;

                if (protocolVault.stats.hookedNames.indexOf(moduleName) === -1) {
                    protocolVault.stats.modHooks++;
                    if (protocolVault.stats.hookedNames.length < 30) {
                        protocolVault.stats.hookedNames.push(moduleName);
                        sendHost('DiagLog', {
                            message: '[Privacy Hook] hooked ' + kind + ' -> ' + moduleName,
                        });
                    }
                }

                if (kind === 'ls_seen') {
                    if (moduleObj && typeof moduleObj.exports === 'function') {
                        moduleObj.exports = makeLsSeenWrapper(moduleObj.exports, 'LS:' + moduleName);
                    }
                    if (exportsObj && (typeof exportsObj === 'object' || typeof exportsObj === 'function')) {
                        const candidates = ['default', 'nop', moduleName];
                        for (let c = 0; c < candidates.length; c++) {
                            const k = candidates[c];
                            if (typeof exportsObj[k] === 'function') {
                                exportsObj[k] = makeLsSeenWrapper(exportsObj[k], 'LS:' + moduleName);
                            }
                        }
                    }
                } else if (kind === 'ls_typing') {
                    if (moduleObj && typeof moduleObj.exports === 'function') {
                        moduleObj.exports = makeLsTypingWrapper(moduleObj.exports, 'LS:' + moduleName);
                    }
                    if (exportsObj && (typeof exportsObj === 'object' || typeof exportsObj === 'function')) {
                        const candidates = ['default', 'nop', moduleName];
                        for (let c = 0; c < candidates.length; c++) {
                            const k = candidates[c];
                            if (typeof exportsObj[k] === 'function') {
                                exportsObj[k] = makeLsTypingWrapper(exportsObj[k], 'LS:' + moduleName);
                            }
                        }
                    }
                } else if (kind === 'maw_jobs') {
                    const js =
                        (exportsObj && exportsObj.jobSerializers) ||
                        (exportsObj && exportsObj.default && exportsObj.default.jobSerializers);
                    if (js && typeof js === 'object') {
                        const jKeys = Object.keys(js);
                        for (let j = 0; j < jKeys.length; j++) {
                            const jk = jKeys[j];
                            const origSer = js[jk];
                            if (typeof origSer !== 'function' || origSer.__n0Wrapped) continue;
                            if (/^(markThreadAsRead|markChatAsRead|markAsRead|markRead|sendReadReceipt|updateReadReceipt)$/i.test(jk)) {
                                js[jk] = copyMetaFnProps(origSer, function () {
                                    if (featureState.blockSeen) {
                                        recordPrivacyBlock('seen', 'MAWJob:' + jk);
                                        return undefined;
                                    }
                                    return origSer.apply(this, arguments);
                                });
                            } else if (/^(sendChatState|sendTyping|sendTypingState|sendTypingIndicator|updateTypingState|sendComposing)$/i.test(jk)) {
                                js[jk] = copyMetaFnProps(origSer, function () {
                                    if (featureState.blockTyping) {
                                        recordPrivacyBlock('typing', 'MAWJob:' + jk);
                                        return undefined;
                                    }
                                    return origSer.apply(this, arguments);
                                });
                            }
                        }
                    }
                } else if (kind === 'maw_read_hook') {
                    if (moduleObj && typeof moduleObj.exports === 'function') {
                        moduleObj.exports = makeReadHookOrActionWrapper(moduleObj.exports, 'exports', moduleName);
                    }
                    if (exportsObj && typeof exportsObj === 'object') {
                        const eKeys = Object.keys(exportsObj);
                        for (let e = 0; e < eKeys.length; e++) {
                            const ek = eKeys[e];
                            if (
                                typeof exportsObj[ek] === 'function' &&
                                (ek === 'default' || ek === moduleName || /(markThread.*Read|markChat.*Read|markRead)/i.test(ek))
                            ) {
                                exportsObj[ek] = makeReadHookOrActionWrapper(exportsObj[ek], ek, moduleName + '.' + ek);
                            }
                        }
                    }
                } else if (kind === 'maw_bridge') {
                    const targets = [exportsObj, exportsObj && exportsObj.default, moduleObj && moduleObj.exports];
                    for (let t = 0; t < targets.length; t++) {
                        const tgt = targets[t];
                        if (!tgt || (typeof tgt !== 'object' && typeof tgt !== 'function')) continue;
                        patchMawBridgeInstance(tgt);
                        const getters = ['getBridge', 'getInstance'];
                        for (let g = 0; g < getters.length; g++) {
                            const gName = getters[g];
                            const origGet = tgt[gName];
                            if (typeof origGet === 'function' && !origGet.__n0Wrapped) {
                                tgt[gName] = copyMetaFnProps(origGet, function () {
                                    const inst = origGet.apply(this, arguments);
                                    return patchMawBridgeInstance(inst);
                                });
                            }
                        }
                    }
                } else if (kind === 'typing_mod') {
                    if (moduleObj && typeof moduleObj.exports === 'function') {
                        moduleObj.exports = makeTypingExportWrapper(moduleObj.exports, 'exports', 'mod:' + moduleName);
                    }
                    if (exportsObj && typeof exportsObj === 'object') {
                        const eKeys = Object.keys(exportsObj);
                        for (let e = 0; e < eKeys.length; e++) {
                            const ek = eKeys[e];
                            if (typeof exportsObj[ek] === 'function') {
                                exportsObj[ek] = makeTypingExportWrapper(exportsObj[ek], ek, 'mod:' + moduleName + '.' + ek);
                            }
                        }
                    }
                } else if (kind === 'ls_recall_insert' || kind === 'ls_recall_unsend') {
                    const observeLsRecallFn = function (origFn) {
                        if (typeof origFn !== 'function' || origFn.__n0Wrapped) return origFn;
                        return copyMetaFnProps(origFn, function () {
                            if (antiRecallEnabled) {
                                try {
                                    let foundMsgId = '';
                                    let foundThreadKey = '';
                                    let foundText = '';
                                    for (let a = 0; a < arguments.length; a++) {
                                        const arg = arguments[a];
                                        if (typeof arg === 'string') {
                                            const s = arg.trim();
                                            if (!s) continue;
                                            if (!foundMsgId && (MSG_ID_TOKEN_RE.test(s) || (/^(?:wamid\.|\$)[A-Za-z0-9_.:=-]+$/.test(s)))) {
                                                foundMsgId = s;
                                            } else if (!foundText && !/^\d+$/.test(s) && s.length <= 4000 && isValidCapturedContent(s, [])) {
                                                foundText = s;
                                            }
                                        } else if (Array.isArray(arg) && arg.length === 2 && typeof arg[0] === 'number' && typeof arg[1] === 'number') {
                                            const i64 = normalizeMetaId(arg);
                                            if (!foundThreadKey) foundThreadKey = i64;
                                            else if (!foundMsgId) foundMsgId = i64;
                                        } else if (arg && typeof arg === 'object' && !Array.isArray(arg) && typeof arg.resolve !== 'function') {
                                            walkLsPayload(arg, 0);
                                        }
                                    }
                                    if (kind === 'ls_recall_insert' && foundText && foundMsgId) {
                                        ingestProtocolMessage({
                                            msgId: foundMsgId,
                                            text: foundText,
                                            threadKey: foundThreadKey,
                                        });
                                    } else if (kind === 'ls_recall_unsend' && foundMsgId) {
                                        flagProtocolRecall(foundMsgId, foundThreadKey);
                                    }
                                } catch (_) {}
                            }
                            return origFn.apply(this, arguments);
                        });
                    };
                    if (moduleObj && typeof moduleObj.exports === 'function') {
                        moduleObj.exports = observeLsRecallFn(moduleObj.exports);
                    }
                    if (exportsObj && (typeof exportsObj === 'object' || typeof exportsObj === 'function')) {
                        const candidates = ['default', 'nop', moduleName];
                        for (let c = 0; c < candidates.length; c++) {
                            const ck = candidates[c];
                            if (typeof exportsObj[ck] === 'function') {
                                exportsObj[ck] = observeLsRecallFn(exportsObj[ck]);
                            }
                        }
                    }
                }
            } catch (_) {}
            return ret;
        };
        wrappedFactory.__n0FactoryWrapped = true;
        return copyMetaFnProps(origFactory, wrappedFactory);
    }

    function wrapMetaDefineFn(origDefine) {
        if (typeof origDefine !== 'function' || origDefine.__n0DefineProxy) return origDefine;
        if (typeof Proxy === 'function') {
            const proxied = new Proxy(origDefine, {
                apply: function (target, thisArg, argArray) {
                    try {
                        if (argArray && argArray.length >= 2 && typeof argArray[0] === 'string') {
                            const modName = argArray[0];
                            const kind = classifyMetaPrivacyModule(modName);
                            if (kind) {
                                const fIdx =
                                    typeof argArray[2] === 'function'
                                        ? 2
                                        : typeof argArray[1] === 'function'
                                        ? 1
                                        : -1;
                                if (fIdx !== -1) {
                                    const nextArgs = Array.prototype.slice.call(argArray);
                                    nextArgs[fIdx] = wrapMetaModuleFactory(modName, kind, argArray[fIdx]);
                                    return Reflect.apply(target, thisArg, nextArgs);
                                }
                            }
                        }
                    } catch (_) {}
                    return Reflect.apply(target, thisArg, argArray);
                },
                get: function (target, prop, receiver) {
                    if (prop === '__n0DefineProxy') return true;
                    return Reflect.get(target, prop, receiver);
                },
            });
            return proxied;
        }
        return origDefine;
    }

    function installMetaModulePrivacyHooks() {
        try {
            let activeDefine = typeof window.__d === 'function' ? wrapMetaDefineFn(window.__d) : window.__d;
            Object.defineProperty(window, '__d', {
                configurable: true,
                enumerable: true,
                get: function () {
                    return activeDefine;
                },
                set: function (nextVal) {
                    activeDefine = typeof nextVal === 'function' ? wrapMetaDefineFn(nextVal) : nextVal;
                },
            });
        } catch (_) {
            if (typeof window.__d === 'function') {
                window.__d = wrapMetaDefineFn(window.__d);
            }
        }
    }

    // ================= LAYER 2: WORKER & MESSAGEPORT OUTBOUND RPC FILTER =================
    function mutateWorkerPayloadInPlace(node, mode, depth) {
        if (!node || typeof node !== 'object' || depth > 3) return false;
        if (
            node instanceof ArrayBuffer ||
            ArrayBuffer.isView(node) ||
            (typeof Blob === 'function' && node instanceof Blob) ||
            (typeof MessagePort === 'function' && node instanceof MessagePort)
        ) {
            return false;
        }
        let changed = false;
        if (Array.isArray(node)) {
            for (let i = 0; i < Math.min(node.length, 10); i++) {
                if (mutateWorkerPayloadInPlace(node[i], mode, depth + 1)) changed = true;
            }
            return changed;
        }
        if (mode === 'seen') {
            if ('isReadReceiptsDisabled' in node || 'chatJid' in node || 'threadJid' in node) {
                try {
                    node.isReadReceiptsDisabled = true;
                    changed = true;
                } catch (_) {}
            }
        } else if (mode === 'typing') {
            if (node.chatState === 'composing') {
                try {
                    node.chatState = 'paused';
                    changed = true;
                } catch (_) {}
            }
            if (node.state === 'composing') {
                try {
                    node.state = 'paused';
                    changed = true;
                } catch (_) {}
            }
            if (node.isTyping === true) {
                try {
                    node.isTyping = false;
                    changed = true;
                } catch (_) {}
            }
            if (node.typing === true) {
                try {
                    node.typing = false;
                    changed = true;
                } catch (_) {}
            }
        }
        const subKeys = ['args', 'payload', 'data', 'params', 'body'];
        for (let i = 0; i < subKeys.length; i++) {
            const sub = node[subKeys[i]];
            if (sub && typeof sub === 'object') {
                if (mutateWorkerPayloadInPlace(sub, mode, depth + 1)) changed = true;
            }
        }
        return changed;
    }

    function extractWorkerRpcOp(msg) {
        if (!msg || typeof msg !== 'object') return '';
        if (Array.isArray(msg)) {
            if (typeof msg[1] === 'string') return msg[1];
            if (typeof msg[0] === 'string') return msg[0];
            return '';
        }
        const opFields = ['action', 'method', 'fn', 'fnName', 'op', 'command', 'bridgeAction', 'event', 'type'];
        for (let i = 0; i < opFields.length; i++) {
            const v = msg[opFields[i]];
            if (typeof v === 'string' && v !== 'fireAndForget' && v !== 'sendAndReceive' && v !== 'rpc' && v !== 'call') {
                return v;
            }
        }
        if (Array.isArray(msg.args)) {
            if (typeof msg.args[1] === 'string' && msg.args[0] === 'backend') return msg.args[1];
            if (typeof msg.args[0] === 'string') return msg.args[0];
        }
        return '';
    }

    function filterOutboundWorkerRpc(msg) {
        if (!msg || typeof msg !== 'object' || (!featureState.blockSeen && !featureState.blockTyping)) {
            return 'pass';
        }
        if (msg instanceof ArrayBuffer || ArrayBuffer.isView(msg)) return 'pass';
        const op = extractWorkerRpcOp(msg);
        if (!op) return 'pass';
        if (/^(sendText|sendMedia|sendMsg|sendMessage|sendReaction|unsend|revoke|delete|sync|init|open|decrypt|encrypt|fetch|load|get|query)/i.test(op)) {
            return 'pass';
        }
        const isFireAndForget =
            msg.fireAndForget === true ||
            msg.type === 'fireAndForget' ||
            (!('callId' in msg) &&
                !('requestId' in msg) &&
                !('reqId' in msg) &&
                !('promiseId' in msg) &&
                typeof msg.id !== 'number' &&
                typeof msg.id !== 'string');

        if (
            featureState.blockSeen &&
            /^(markThreadAsRead|markChatAsRead|markAsRead|markRead|sendReadReceipt|updateReadReceipt)$/i.test(op)
        ) {
            mutateWorkerPayloadInPlace(msg, 'seen', 0);
            recordPrivacyBlock('seen', 'worker:' + op);
            return isFireAndForget ? 'drop' : 'pass';
        }
        if (
            featureState.blockTyping &&
            /^(sendChatState|sendTyping|sendTypingState|sendTypingIndicator|updateTypingState|sendComposing|chatStateComposing)$/i.test(op)
        ) {
            mutateWorkerPayloadInPlace(msg, 'typing', 0);
            recordPrivacyBlock('typing', 'worker:' + op);
            return isFireAndForget ? 'drop' : 'pass';
        }
        return 'pass';
    }

    function installNetworkAndSocketHooks() {
        // 1. WebSocket Proxy (inbound capture + outbound Seen/Typing privacy filter)
        if (typeof window.WebSocket === 'function' && typeof Proxy === 'function') {
            const OrigWebSocket = window.WebSocket;
            const origProtoSend = OrigWebSocket.prototype && OrigWebSocket.prototype.send;
            if (typeof origProtoSend === 'function') {
                OrigWebSocket.prototype.send = function (data) {
                    let res = null;
                    try {
                        res = filterOutboundWsData(this, data);
                    } catch (_) {
                        return origProtoSend.apply(this, arguments);
                    }
                    if (res.action === 'drop') return;
                    if (res.action === 'replace') return origProtoSend.call(this, res.data);
                    return origProtoSend.apply(this, arguments);
                };
            }

            window.WebSocket = new Proxy(OrigWebSocket, {
                construct: function (target, args, newTarget) {
                    const ws = Reflect.construct(target, args, newTarget);
                    try {
                        protocolVault.stats.wsOpen++;
                        const origAdd = typeof ws.addEventListener === 'function' ? ws.addEventListener : null;
                        if (origAdd) {
                            const fns = [];
                            wsTrackedListeners.set(ws, fns);
                            origAdd.call(ws, 'message', function (evt) {
                                protocolVault.stats.wsFrames++;
                                inspectRawNetworkData(evt && evt.data);
                            });
                            ws.addEventListener = function (type, fn) {
                                if (type === 'message' && typeof fn === 'function') fns.push(fn);
                                return origAdd.apply(this, arguments);
                            };
                        }
                        if (typeof origProtoSend !== 'function' && typeof ws.send === 'function') {
                            const instSend = ws.send;
                            ws.send = function (data) {
                                let res = null;
                                try {
                                    res = filterOutboundWsData(this, data);
                                } catch (_) {
                                    return instSend.apply(this, arguments);
                                }
                                if (res.action === 'drop') return;
                                if (res.action === 'replace') return instSend.call(this, res.data);
                                return instSend.apply(this, arguments);
                            };
                        }
                    } catch (_) {}
                    return ws;
                },
            });
        }

        // 2. IndexedDB Hook (bắt bản ghi tin nhắn E2EE vừa giải mã hoặc đánh dấu xóa)
        if (typeof IDBObjectStore === 'function' && IDBObjectStore.prototype) {
            const proto = IDBObjectStore.prototype;
            ['put', 'add'].forEach(function (methodName) {
                const origFn = proto[methodName];
                if (typeof origFn !== 'function') return;
                proto[methodName] = function () {
                    try {
                        protocolVault.stats.idbWrites++;
                        if (arguments.length > 0 && arguments[0] && typeof arguments[0] === 'object') {
                            walkLsPayload(arguments[0], 0);
                        }
                    } catch (_) {}
                    return origFn.apply(this, arguments);
                };
            });
            const origDelete = proto.delete;
            if (typeof origDelete === 'function') {
                proto.delete = function (key) {
                    try {
                        if (typeof key === 'string' && protocolVault.byMsgId[key]) {
                            flagProtocolRecall(key);
                        }
                    } catch (_) {}
                    return origDelete.apply(this, arguments);
                };
            }
        }

        // 3. Web Worker & MessagePort Hook (inbound E2EE capture + outbound MAW Seen/Typing RPC filter)
        if (typeof window.Worker === 'function') {
            const OrigWorker = window.Worker;
            const origWorkerPost = OrigWorker.prototype && OrigWorker.prototype.postMessage;
            if (typeof origWorkerPost === 'function') {
                OrigWorker.prototype.postMessage = function (msg) {
                    try {
                        if (filterOutboundWorkerRpc(msg) === 'drop') return;
                    } catch (_) {}
                    return origWorkerPost.apply(this, arguments);
                };
            }
            if (typeof Proxy === 'function') {
                window.Worker = new Proxy(OrigWorker, {
                    construct: function (target, args, newTarget) {
                        const worker = Reflect.construct(target, args, newTarget);
                        try {
                            if (typeof worker.addEventListener === 'function') {
                                worker.addEventListener('message', function (evt) {
                                    if (evt && evt.data && typeof evt.data === 'object') {
                                        walkLsPayload(evt.data, 0);
                                    }
                                });
                            }
                            if (typeof origWorkerPost !== 'function' && typeof worker.postMessage === 'function') {
                                const instPost = worker.postMessage;
                                worker.postMessage = function (msg) {
                                    try {
                                        if (filterOutboundWorkerRpc(msg) === 'drop') return;
                                    } catch (_) {}
                                    return instPost.apply(this, arguments);
                                };
                            }
                        } catch (_) {}
                        return worker;
                    },
                });
            }
        }

        if (typeof MessagePort === 'function' && MessagePort.prototype && typeof MessagePort.prototype.postMessage === 'function') {
            const origPortPost = MessagePort.prototype.postMessage;
            MessagePort.prototype.postMessage = function (msg) {
                if (!msg || typeof msg !== 'object' || (!featureState.blockSeen && !featureState.blockTyping)) {
                    return origPortPost.apply(this, arguments);
                }
                try {
                    if (filterOutboundWorkerRpc(msg) === 'drop') return;
                } catch (_) {}
                return origPortPost.apply(this, arguments);
            };
        }

        // 4. WebRTC (UDP DataChannel) Hook thụ động
        if (typeof window.RTCPeerConnection === 'function' && typeof Proxy === 'function') {
            const OrigRTC = window.RTCPeerConnection;
            function attachDataChannel(dc) {
                if (!dc || typeof dc.addEventListener !== 'function') return;
                try {
                    dc.addEventListener('message', function (evt) {
                        inspectRawNetworkData(evt && evt.data);
                    });
                } catch (_) {}
            }
            window.RTCPeerConnection = new Proxy(OrigRTC, {
                construct: function (target, args, newTarget) {
                    const pc = Reflect.construct(target, args, newTarget);
                    try {
                        pc.addEventListener('datachannel', function (evt) {
                            if (evt && evt.channel) attachDataChannel(evt.channel);
                        });
                        if (typeof pc.createDataChannel === 'function') {
                            const origCreateDc = pc.createDataChannel;
                            pc.createDataChannel = function () {
                                const dc = origCreateDc.apply(this, arguments);
                                attachDataChannel(dc);
                                return dc;
                            };
                        }
                    } catch (_) {}
                    return pc;
                },
            });
        }

        // 5. Fetch, XMLHttpRequest & sendBeacon Hooks (GraphQL capture + Seen/Typing HTTP filter)
        if (typeof window.fetch === 'function') {
            const origFetch = window.fetch;
            window.fetch = function () {
                const urlArg = arguments[0];
                const urlStr = typeof urlArg === 'string' ? urlArg : (urlArg && urlArg.url) || '';
                const bodyStr = extractRequestBodyString(arguments[1] && arguments[1].body);
                const blk = shouldBlockHttpPrivacyRequest(urlStr, bodyStr);
                if (blk) {
                    recordPrivacyBlock(blk, 'http:fetch');
                    if (typeof Response === 'function') {
                        return Promise.resolve(
                            new Response('{"data":{}}', {
                                status: 200,
                                headers: { 'Content-Type': 'application/json' },
                            })
                        );
                    }
                    return Promise.resolve({
                        ok: true,
                        status: 200,
                        headers: { get: function () { return 'application/json'; } },
                        text: function () { return Promise.resolve('{"data":{}}'); },
                        json: function () { return Promise.resolve({ data: {} }); },
                        clone: function () { return this; },
                    });
                }
                const p = origFetch.apply(this, arguments);
                if (antiRecallEnabled && urlStr.indexOf('/api/graphql') !== -1 && p && typeof p.then === 'function') {
                    p.then(function (resp) {
                        try {
                            if (!resp || !resp.ok || typeof resp.clone !== 'function') return;
                            const ct = resp.headers && typeof resp.headers.get === 'function' ? (resp.headers.get('content-type') || '') : '';
                            if (ct && ct.indexOf('json') === -1 && ct.indexOf('text') === -1) return;
                            resp.clone().text().then(function (txt) {
                                if (txt && txt.length <= 512 * 1024) {
                                    parseAndInspectJsonSegments(txt);
                                }
                            }).catch(function () {});
                        } catch (_) {}
                    }).catch(function () {});
                }
                return p;
            };
        }

        if (typeof XMLHttpRequest === 'function' && XMLHttpRequest.prototype) {
            const xhrProto = XMLHttpRequest.prototype;
            const origOpen = xhrProto.open;
            const origXhrSend = xhrProto.send;
            if (typeof origOpen === 'function' && typeof origXhrSend === 'function') {
                xhrProto.open = function (_method, url) {
                    this.__n0ReqUrl = typeof url === 'string' ? url : String(url || '');
                    return origOpen.apply(this, arguments);
                };
                xhrProto.send = function (body) {
                    const blk = shouldBlockHttpPrivacyRequest(this.__n0ReqUrl || '', extractRequestBodyString(body));
                    if (blk) {
                        recordPrivacyBlock(blk, 'http:xhr');
                        const selfXhr = this;
                        Promise.resolve().then(function () {
                            try {
                                Object.defineProperty(selfXhr, 'readyState', { value: 4, configurable: true });
                                Object.defineProperty(selfXhr, 'status', { value: 200, configurable: true });
                                Object.defineProperty(selfXhr, 'responseText', { value: '{"data":{}}', configurable: true });
                                Object.defineProperty(selfXhr, 'response', { value: '{"data":{}}', configurable: true });
                            } catch (_) {}
                            try {
                                if (typeof selfXhr.onreadystatechange === 'function') selfXhr.onreadystatechange();
                                if (typeof selfXhr.onload === 'function') selfXhr.onload();
                                if (typeof selfXhr.onloadend === 'function') selfXhr.onloadend();
                            } catch (_) {}
                        });
                        return;
                    }
                    return origXhrSend.apply(this, arguments);
                };
            }
        }

        if (typeof navigator === 'object' && navigator && typeof navigator.sendBeacon === 'function') {
            const origBeacon = navigator.sendBeacon.bind(navigator);
            navigator.sendBeacon = function (url, data) {
                const blk = shouldBlockHttpPrivacyRequest(url, extractRequestBodyString(data));
                if (blk) {
                    recordPrivacyBlock(blk, 'http:beacon');
                    return true;
                }
                return origBeacon(url, data);
            };
        }
    }

    installErrorTelemetry();
    installBlobRevokeBlocker();
    installMetaModulePrivacyHooks();
    installNetworkAndSocketHooks();

    function getSavedTheme() {
        if (featureState && (featureState.theme === 'light' || featureState.theme === 'dark')) {
            return featureState.theme;
        }
        try {
            return localStorage.getItem(THEME_STORAGE_KEY) || 'dark';
        } catch (_) {
            return 'dark';
        }
    }

    // Đồng bộ toàn bộ <html>, <body> và các vùng container của Messenger Comet
    function syncMessengerNativeTheme(mode) {
        const root = document.documentElement;
        if (!root) return;

        const isDark = mode === 'dark';
        const addCls = isDark ? '__fb-dark-mode' : '__fb-light-mode';
        const remCls = isDark ? '__fb-light-mode' : '__fb-dark-mode';

        root.style.colorScheme = isDark ? 'dark' : 'light';
        if (isDark) root.classList.remove('n0-light');
        else root.classList.add('n0-light');

        if (!root.classList.contains(addCls)) {
            root.classList.add(addCls);
        }
        if (root.classList.contains(remCls)) {
            root.classList.remove(remCls);
        }

        if (document.body) {
            if (!document.body.classList.contains(addCls)) {
                document.body.classList.add(addCls);
            }
            if (document.body.classList.contains(remCls)) {
                document.body.classList.remove(remCls);
            }
        }

        const mismatched = document.querySelectorAll('.' + remCls);
        for (let i = 0; i < mismatched.length; i++) {
            mismatched[i].classList.remove(remCls);
            mismatched[i].classList.add(addCls);
        }
    }

    function applyTheme(theme, notifyHost) {
        const mode = theme === 'light' ? 'light' : 'dark';
        const root = document.documentElement;
        if (!root) return;

        featureState.theme = mode;
        root.setAttribute('data-n0-theme', mode);
        syncMessengerNativeTheme(mode);

        try {
            localStorage.setItem(THEME_STORAGE_KEY, mode);
        } catch (_) {}

        if (typeof syncControlMenuUi === 'function') {
            syncControlMenuUi();
        }
        if (notifyHost !== false) {
            sendHost('ThemeDetected', { is_dark: mode === 'dark' });
        }
    }

    function applyFeatureEffectsToDom() {
        const root = document.documentElement;
        if (root) {
            if (featureState.privateMode) root.classList.add('private-mode');
            else root.classList.remove('private-mode');

            if (featureState.sidebarHidden) root.classList.add('sidebar-hidden');
            else root.classList.remove('sidebar-hidden');
        }
        if (document.body) {
            document.body.style.zoom = String(featureState.zoomFactor || 1.0);
        }
        antiRecallEnabled = !!featureState.antiRecall;
    }

    function applyFeatureState(nextState) {
        if (!nextState || typeof nextState !== 'object') return;
        if (typeof nextState.anti_recall === 'boolean') featureState.antiRecall = nextState.anti_recall;
        if (typeof nextState.block_seen === 'boolean') featureState.blockSeen = nextState.block_seen;
        if (typeof nextState.block_typing === 'boolean') featureState.blockTyping = nextState.block_typing;
        if (typeof nextState.private_mode === 'boolean') featureState.privateMode = nextState.private_mode;
        if (typeof nextState.sidebar_hidden === 'boolean') featureState.sidebarHidden = nextState.sidebar_hidden;
        if (typeof nextState.always_on_top === 'boolean') featureState.alwaysOnTop = nextState.always_on_top;
        if (typeof nextState.background_on_close === 'boolean') featureState.backgroundOnClose = nextState.background_on_close;
        if (typeof nextState.run_at_startup === 'boolean') featureState.runAtStartup = nextState.run_at_startup;
        if (typeof nextState.zoom_factor === 'number' && isFinite(nextState.zoom_factor)) {
            featureState.zoomFactor = Math.max(0.7, Math.min(1.6, Math.round(nextState.zoom_factor * 100) / 100));
        }
        if (nextState.theme === 'light' || nextState.theme === 'dark') {
            if (nextState.theme !== featureState.theme) {
                applyTheme(nextState.theme, false);
            }
        }
        persistFeatureStateToLocalStorage();
        applyFeatureEffectsToDom();
        if (typeof syncControlMenuUi === 'function') syncControlMenuUi();
        if (antiRecallEnabled && typeof scanAntiRecall === 'function') scanAntiRecall();
    }

    function persistFeatureStateToLocalStorage() {
        try {
            localStorage.setItem(ANTI_RECALL_ENABLED_KEY, featureState.antiRecall ? '1' : '0');
            localStorage.setItem(BLOCK_SEEN_KEY, featureState.blockSeen ? '1' : '0');
            localStorage.setItem(BLOCK_TYPING_KEY, featureState.blockTyping ? '1' : '0');
            localStorage.setItem(PRIVATE_MODE_KEY, featureState.privateMode ? '1' : '0');
            localStorage.setItem(SIDEBAR_HIDDEN_KEY, featureState.sidebarHidden ? '1' : '0');
            localStorage.setItem(ALWAYS_ON_TOP_KEY, featureState.alwaysOnTop ? '1' : '0');
            localStorage.setItem(BG_ON_CLOSE_KEY, featureState.backgroundOnClose ? '1' : '0');
            localStorage.setItem(ZOOM_FACTOR_KEY, String(featureState.zoomFactor || 1.0));
        } catch (_) {}
    }

    function updatePageContext() {
        const root = document.documentElement;
        if (!root) return;

        const hasChatApp = !!document.querySelector('[role="navigation"], [role="main"]');
        const targetPage = hasChatApp ? 'app' : 'login';

        if (root.getAttribute('data-n0-page') !== targetPage) {
            root.setAttribute('data-n0-page', targetPage);
        }

        if (typeof ensureControlMenuUi === 'function') {
            ensureControlMenuUi();
        }

        if (targetPage === 'login') {
            replaceWelcomeHeading();
            hideOriginalLoginLogo();
            updateSaveLoginCheckbox();
        } else {
            // Khi ở giao diện Chat: khôi phục nguyên bản toàn bộ icon của Messenger
            const customImgs = document.querySelectorAll('.n0trxxan-custom-logo');
            for (let i = 0; i < customImgs.length; i++) {
                customImgs[i].remove();
            }
            const hiddenLogos = document.querySelectorAll('.n0-logo-hidden, [data-n0-orig-logo="true"]');
            for (let i = 0; i < hiddenLogos.length; i++) {
                const el = hiddenLogos[i];
                el.classList.remove('n0-logo-hidden');
                el.removeAttribute('data-n0-orig-logo');
                el.style.removeProperty('display');
                el.style.removeProperty('opacity');
                el.style.removeProperty('height');
            }
        }
    }

    function updateSaveLoginCheckbox() {
        const root = document.documentElement;
        if (!root || root.getAttribute('data-n0-page') !== 'login') return;

        const checkbox = document.querySelector('input[type="checkbox"], #persist_box');
        if (checkbox) {
            const container = checkbox.closest('.uiInputLabel, div');
            if (container && container !== document.body && container.tagName !== 'FORM') {
                container.classList.add('n0-checkbox-container');
            }
        }

        const labels = document.querySelectorAll('label, .uiInputLabelLabel, [for="persist_box"]');
        for (let i = 0; i < labels.length; i++) {
            const el = labels[i];
            if (el.getAttribute('data-n0-save-login') === 'true') continue;

            const text = (el.textContent || '').trim().toLowerCase();
            if (
                text.includes('duy trì đăng nhập') ||
                text.includes('keep me signed in')
            ) {
                el.setAttribute('data-n0-save-login', 'true');
                const cb = el.querySelector('input[type="checkbox"]');
                if (cb) {
                    for (let j = 0; j < el.childNodes.length; j++) {
                        const node = el.childNodes[j];
                        if (node.nodeType === 3 && node.textContent.trim().length > 0) {
                            node.textContent = ' Save login';
                            break;
                        }
                    }
                } else {
                    el.textContent = 'Save login';
                }
            }
        }
    }

    function hideOriginalLoginLogo() {
        const root = document.documentElement;
        if (!root || root.getAttribute('data-n0-page') !== 'login') return;

        // Chỉ ẩn thẻ svg hoặc [role="img"] là logo Messenger gốc (bên ngoài form và ngoài theme toggle)
        const svgs = document.querySelectorAll('svg, [role="img"]');
        for (let i = 0; i < svgs.length; i++) {
            const el = svgs[i];
            if (el.getAttribute('data-n0-orig-logo') === 'true') continue;
            if (el.closest('#n0trxxan-menu-root') || el.closest('[data-n0-ui="control-menu"]')) continue;
            if (el.closest('form')) continue;
            if (el.closest('[data-n0-welcome="true"]')) continue;

            // Bỏ qua spinner loading
            const className = (typeof el.className === 'string' ? el.className : (el.className.baseVal || '')).toLowerCase();
            if (className.includes('spin') || className.includes('load') || className.includes('progress') || el.closest('[role="progressbar"], .uiLoadingIndicatorAsync')) {
                continue;
            }

            el.style.setProperty('display', 'none', 'important');
            el.style.setProperty('opacity', '0', 'important');
            el.style.setProperty('height', '0px', 'important');
            el.setAttribute('data-n0-orig-logo', 'true');
        }

        const welcomeEl = document.querySelector('[data-n0-welcome="true"]');
        if (!welcomeEl) return;

        let curr = welcomeEl;
        for (let depth = 0; depth < 5 && curr && curr !== document.body; depth++) {
            let prev = curr.previousElementSibling;
            while (prev) {
                if (prev.matches('svg, img, i, [role="img"]') || prev.querySelector('svg, img, i, [role="img"]')) {
                    prev.style.setProperty('display', 'none', 'important');
                    prev.style.setProperty('opacity', '0', 'important');
                    prev.style.setProperty('height', '0px', 'important');
                    prev.setAttribute('data-n0-orig-logo', 'true');
                }
                prev = prev.previousElementSibling;
            }
            curr = curr.parentElement;
        }
    }

    function replaceWelcomeHeading() {
        const root = document.documentElement;
        if (!root || root.getAttribute('data-n0-page') !== 'login') return;

        hideOriginalLoginLogo();
        if (document.querySelector('[data-n0-welcome="true"]')) return;
        const targets = document.querySelectorAll('h1, h2, h3, [role="heading"], ._9403, span');
        for (let i = 0; i < targets.length; i++) {
            const el = targets[i];
            if (el.closest('form') || el.closest('#n0trxxan-menu-root')) continue;
            const text = (el.textContent || '').trim().toLowerCase();
            if (
                text.indexOf('kết nối với những người bạn yêu quý') !== -1 ||
                text.indexOf('connect with your favorite people') !== -1 ||
                text.indexOf('welcome to messenger') !== -1
            ) {
                el.setAttribute('data-n0-welcome', 'true');
                hideOriginalLoginLogo();
                return;
            }
        }
    }

    window.__caprine_bridge = {
        receive: function (data) {
            if (!data || !data.action) return;

            switch (data.action) {
                case 'SetTheme':
                    applyTheme(data.data === 'light' ? 'light' : 'dark');
                    break;

                case 'ToggleSidebar':
                    featureState.sidebarHidden = !featureState.sidebarHidden;
                    applyFeatureEffectsToDom();
                    persistFeatureStateToLocalStorage();
                    if (typeof syncControlMenuUi === 'function') syncControlMenuUi();
                    break;

                case 'TogglePrivateMode':
                    featureState.privateMode = !!data.data;
                    applyFeatureEffectsToDom();
                    persistFeatureStateToLocalStorage();
                    if (typeof syncControlMenuUi === 'function') syncControlMenuUi();
                    break;

                case 'SetZoom':
                    if (typeof data.data === 'number' && isFinite(data.data)) {
                        featureState.zoomFactor = Math.max(0.7, Math.min(1.6, Math.round(data.data * 100) / 100));
                        applyFeatureEffectsToDom();
                        persistFeatureStateToLocalStorage();
                        if (typeof syncControlMenuUi === 'function') syncControlMenuUi();
                    }
                    break;

                case 'SetAntiRecall':
                    featureState.antiRecall = !!data.data;
                    applyFeatureEffectsToDom();
                    persistFeatureStateToLocalStorage();
                    if (typeof syncControlMenuUi === 'function') syncControlMenuUi();
                    if (antiRecallEnabled && typeof scanAntiRecall === 'function') scanAntiRecall();
                    break;

                case 'SyncFeatureState':
                    applyFeatureState(data.data);
                    break;

                case 'NewConversation': {
                    const newBtn = document.querySelector('[href="/new/"]');
                    if (newBtn) newBtn.click();
                    break;
                }

                case 'LogOut': {
                    const logoutBtn = document.querySelector('[data-nocache="1"]');
                    if (logoutBtn) logoutBtn.click();
                    break;
                }

                default:
                    break;
            }
        }
    };

    let lastUnreadCount = 0;
    let unreadDebounceTimer = null;

    function checkUnreadCount() {
        if (unreadDebounceTimer) clearTimeout(unreadDebounceTimer);

        unreadDebounceTimer = setTimeout(function () {
            const badges = document.querySelectorAll('[aria-label*="unread"], [aria-label*="chưa đọc"]');
            const totalUnread = badges.length;

            if (totalUnread !== lastUnreadCount) {
                lastUnreadCount = totalUnread;
                sendHost('UpdateUnreadCount', { count: totalUnread });
            }
        }, 600);
    }

    // ================= ANTI-RECALL V3 (LEDGER, FIBER & PROTOCOL RECOVERY) =================
    const rowSnapshotMap = new WeakMap();
    const rowResolvedMap = new WeakMap();
    const knownUnmatchedTombstoneSet = new WeakSet();
    const knownAvatarImgSet = new WeakSet();
    const mediaHookedSet = new WeakSet();
    const actionHandlerMap = new WeakMap();
    const clonedBlobUrlMap = Object.create(null);
    let lastObservedThreadKey = '';
    let activeMutationObserver = null;
    let suppressAntiRecallMutations = false;
    let ledgerDirty = false;
    let recalledLogDirty = false;
    let threadLedgers = {};
    let recalledLog = [];
    let detachedQueue = [];
    const sidebarPreviewCache = Object.create(null);
    const sidebarPendingRecallByThread = Object.create(null);

    function runWithAntiRecallDomLock(fn) {
        suppressAntiRecallMutations = true;
        try {
            return fn();
        } finally {
            try {
                if (activeMutationObserver && typeof activeMutationObserver.takeRecords === 'function') {
                    activeMutationObserver.takeRecords();
                }
            } catch (_) {}
            suppressAntiRecallMutations = false;
        }
    }

    function ensureThreadStore(threadKey, threadTitle) {
        if (!threadLedgers[threadKey] || typeof threadLedgers[threadKey] !== 'object') {
            threadLedgers[threadKey] = {
                title: threadTitle || 'Đoạn chat',
                updatedAt: Date.now(),
                entries: [],
                byMsgId: {},
                recalledById: {},
                recalledRecords: [],
                stableViewport: [],
                stableUpdatedAt: 0,
                _lastDigest: '',
            };
        }
        const st = threadLedgers[threadKey];
        if (!Array.isArray(st.entries)) st.entries = [];
        if (!st.byMsgId || typeof st.byMsgId !== 'object') st.byMsgId = {};
        if (!st.recalledById || typeof st.recalledById !== 'object') st.recalledById = {};
        if (!Array.isArray(st.recalledRecords)) st.recalledRecords = [];
        if (!Array.isArray(st.stableViewport)) st.stableViewport = [];
        if (typeof st.stableUpdatedAt !== 'number') st.stableUpdatedAt = 0;
        if (threadTitle) st.title = threadTitle;
        st.updatedAt = Date.now();
        return st;
    }

    function loadAntiRecallStorage() {
        try {
            const rawLedger = localStorage.getItem(MSG_LEDGER_KEY);
            if (rawLedger) {
                const parsed = JSON.parse(rawLedger);
                if (parsed && typeof parsed === 'object') {
                    threadLedgers = parsed;
                    const tKeys = Object.keys(threadLedgers);
                    for (let i = 0; i < tKeys.length; i++) {
                        const st = threadLedgers[tKeys[i]];
                        if (st && typeof st === 'object') {
                            // Không dùng lại khung nhìn hiển thị từ phiên app cũ
                            st.stableViewport = [];
                            st.stableUpdatedAt = 0;
                            st._lastDigest = '';
                        }
                    }
                }
            }
        } catch (_) {}

        try {
            const rawLog = localStorage.getItem(RECALL_LOG_KEY);
            if (rawLog) {
                const parsed = JSON.parse(rawLog);
                if (Array.isArray(parsed)) {
                    const cleaned = parsed.filter(function (item) {
                        return item && isValidCapturedContent(item.text, item.media);
                    });
                    recalledLog = cleaned;
                    if (cleaned.length !== parsed.length) {
                        try {
                            localStorage.setItem(RECALL_LOG_KEY, JSON.stringify(cleaned.slice(0, 200)));
                        } catch (_) {}
                    }
                }
            }
        } catch (_) {}
    }

    function trimMapKeys(obj, maxKeys) {
        if (!obj || typeof obj !== 'object') return;
        const keys = Object.keys(obj);
        if (keys.length <= maxKeys) return;
        const removeCount = keys.length - maxKeys;
        for (let i = 0; i < removeCount; i++) {
            delete obj[keys[i]];
        }
    }

    let saveRecallTimer = null;
    function scheduleSaveAntiRecall(urgent) {
        if (!ledgerDirty && !recalledLogDirty) return;
        const delay = urgent ? 180 : 1000;
        if (saveRecallTimer) {
            if (!urgent) return;
            clearTimeout(saveRecallTimer);
            saveRecallTimer = null;
        }
        saveRecallTimer = setTimeout(function () {
            saveRecallTimer = null;
            try {
                if (ledgerDirty) {
                    const keys = Object.keys(threadLedgers);
                    if (keys.length > 8) {
                        keys.sort(function (a, b) {
                            const ta = (threadLedgers[a] && threadLedgers[a].updatedAt) || 0;
                            const tb = (threadLedgers[b] && threadLedgers[b].updatedAt) || 0;
                            return tb - ta;
                        });
                        for (let i = 8; i < keys.length; i++) {
                            delete threadLedgers[keys[i]];
                        }
                    }
                    const snapshotOut = {};
                    const remainKeys = Object.keys(threadLedgers);
                    for (let i = 0; i < remainKeys.length; i++) {
                        const tk = remainKeys[i];
                        const st = threadLedgers[tk];
                        if (!st) continue;
                        if (st.entries.length > 120) st.entries = st.entries.slice(-120);
                        if (st.recalledRecords.length > 60) st.recalledRecords = st.recalledRecords.slice(-60);
                        trimMapKeys(st.byMsgId, 120);
                        trimMapKeys(st.recalledById, 80);
                        snapshotOut[tk] = {
                            title: st.title,
                            updatedAt: st.updatedAt,
                            entries: st.entries,
                            byMsgId: st.byMsgId,
                            recalledById: st.recalledById,
                            recalledRecords: st.recalledRecords,
                        };
                    }
                    localStorage.setItem(MSG_LEDGER_KEY, JSON.stringify(snapshotOut));
                    ledgerDirty = false;
                }
                if (recalledLogDirty) {
                    localStorage.setItem(RECALL_LOG_KEY, JSON.stringify(recalledLog.slice(0, 200)));
                    recalledLogDirty = false;
                }
            } catch (_) {
                ledgerDirty = false;
                recalledLogDirty = false;
            }
        }, delay);
    }

    function getActiveThreadTitle() {
        const main = typeof getActiveMainPanel === 'function' ? getActiveMainPanel() : document.querySelector('[role="main"]');
        if (!main) return 'Đoạn chat';
        const headings = main.querySelectorAll('h1, h2, [role="heading"] span, a[href*="/t/"] span');
        for (let i = 0; i < headings.length; i++) {
            const h = headings[i];
            if (h.querySelector('span')) continue;
            const txt = h.textContent ? h.textContent.replace(/\s+/g, ' ').trim() : '';
            if (txt && !/^(đang hoạt động|active now|đoạn chat|chats)$/i.test(txt) && txt.length <= 60) {
                return txt;
            }
        }
        return 'Đoạn chat';
    }

    function extractMessageMetaFromFiber(el) {
        const meta = {
            msgId: '',
            isOutgoing: null,
            senderName: '',
            videoUrl: '',
            posterUrl: '',
            isVideo: false,
            linkUrl: '',
            linkTitle: '',
        };
        if (!el) return meta;

        function inspectAttachmentObj(att) {
            if (!att || typeof att !== 'object') return;
            const rawVid =
                att.playable_url_quality_hd ||
                att.playable_url ||
                att.playableUrl ||
                att.video_url ||
                att.videoUrl ||
                (att.video && typeof att.video === 'object' && (att.video.playable_url || att.video.playableUrl || att.video.src)) ||
                (att.media && typeof att.media === 'object' && (att.media.playable_url || att.media.playableUrl || att.media.video_url));
            if (!meta.videoUrl && typeof rawVid === 'string' && /^(?:https?:|blob:)/i.test(rawVid.trim())) {
                meta.videoUrl = rawVid.trim();
                meta.isVideo = true;
            }
            if (
                att.isVideo === true ||
                att.attachmentType === 'VIDEO' ||
                att.__typename === 'MessageVideo' ||
                att.mediaType === 'video'
            ) {
                meta.isVideo = true;
            }
            const rawPoster =
                att.previewUrl ||
                att.preview_url ||
                att.thumbnailUrl ||
                att.thumbnail_url ||
                (att.preview_image && att.preview_image.uri) ||
                (att.image && att.image.uri) ||
                '';
            if (!meta.posterUrl && typeof rawPoster === 'string' && /^(?:https?:|data:|blob:)/i.test(rawPoster.trim())) {
                meta.posterUrl = rawPoster.trim();
            }
            const rawLink =
                att.targetUrl ||
                att.target_url ||
                att.url ||
                att.webUrl ||
                (att.target && typeof att.target === 'object' && att.target.url) ||
                '';
            if (!meta.linkUrl && typeof rawLink === 'string' && rawLink.trim()) {
                const unwrapped = unwrapMessageLinkUrl(rawLink.trim());
                if (unwrapped) meta.linkUrl = unwrapped;
            }
            const rawTitle =
                att.title ||
                (att.title_with_entities && att.title_with_entities.text) ||
                att.storyTitle ||
                '';
            if (!meta.linkTitle && typeof rawTitle === 'string' && rawTitle.trim() && rawTitle.trim().length <= 160) {
                meta.linkTitle = rawTitle.trim();
            }
        }

        try {
            const candidates = [el, el.firstElementChild, el.parentElement];
            for (let c = 0; c < candidates.length; c++) {
                const node = candidates[c];
                if (!node) continue;
                const keys = Object.keys(node);
                for (let i = 0; i < keys.length; i++) {
                    if (!keys[i].startsWith('__reactFiber$') && !keys[i].startsWith('__reactInternalInstance$')) continue;
                    let fiber = node[keys[i]];
                    for (let hop = 0; hop < 35 && fiber; hop++) {
                        try {
                            const props = fiber.memoizedProps;
                            if (props && typeof props === 'object') {
                                if (!meta.msgId) {
                                    const rawId =
                                        props.messageId ||
                                        props.mid ||
                                        props.offlineThreadingId ||
                                        props.msgId ||
                                        props.primaryKey ||
                                        props.messageKey ||
                                        (props.message &&
                                            typeof props.message === 'object' &&
                                            (props.message.messageId ||
                                                props.message.mid ||
                                                props.message.offlineThreadingId ||
                                                props.message.msgId ||
                                                props.message.id)) ||
                                        (props.msg &&
                                            typeof props.msg === 'object' &&
                                            (props.msg.messageId || props.msg.mid || props.msg.id)) ||
                                        (props.row &&
                                            typeof props.row === 'object' &&
                                            (props.row.messageId || props.row.id));
                                    const normId = normalizeMetaId(rawId);
                                    if (normId) meta.msgId = normId;
                                }
                                if (meta.isOutgoing === null) {
                                    if (typeof props.isOutgoing === 'boolean') meta.isOutgoing = props.isOutgoing;
                                    else if (typeof props.outgoing === 'boolean') meta.isOutgoing = props.outgoing;
                                    else if (typeof props.isViewerAuthor === 'boolean') meta.isOutgoing = props.isViewerAuthor;
                                    else if (typeof props.isAuthor === 'boolean') meta.isOutgoing = props.isAuthor;
                                    else if (props.direction === 'outgoing') meta.isOutgoing = true;
                                    else if (props.direction === 'incoming') meta.isOutgoing = false;
                                    else if (props.message && typeof props.message.isOutgoing === 'boolean') {
                                        meta.isOutgoing = props.message.isOutgoing;
                                    }
                                }
                                if (!meta.senderName) {
                                    const sn =
                                        props.senderName ||
                                        props.authorName ||
                                        (props.message && props.message.senderName) ||
                                        '';
                                    if (typeof sn === 'string' && sn.trim() && sn.trim().length <= 60) {
                                        meta.senderName = sn.trim();
                                    }
                                }

                                inspectAttachmentObj(props);
                                if (props.attachment) inspectAttachmentObj(props.attachment);
                                if (props.xma) inspectAttachmentObj(props.xma);
                                if (props.storyAttachment) inspectAttachmentObj(props.storyAttachment);
                                if (props.video) inspectAttachmentObj(props.video);
                                if (Array.isArray(props.attachments) && props.attachments[0]) inspectAttachmentObj(props.attachments[0]);
                                if (Array.isArray(props.blobAttachments) && props.blobAttachments[0]) inspectAttachmentObj(props.blobAttachments[0]);
                                if (props.message && typeof props.message === 'object') {
                                    inspectAttachmentObj(props.message);
                                    if (Array.isArray(props.message.blob_attachments) && props.message.blob_attachments[0]) {
                                        inspectAttachmentObj(props.message.blob_attachments[0]);
                                    }
                                }
                            }
                            if (!meta.msgId && typeof fiber.key === 'string') {
                                const k = fiber.key.trim();
                                if (
                                    k.length >= 4 &&
                                    !/^\.?\$?\d{1,3}$/.test(k) &&
                                    !/^(header|footer|composer|avatar|timestamp|reaction|row|item|null|undefined)/i.test(k)
                                ) {
                                    meta.msgId = k;
                                }
                            }
                        } catch (_) {}
                        if (meta.msgId && meta.isOutgoing !== null && meta.senderName && (meta.videoUrl || meta.linkUrl)) {
                            return meta;
                        }
                        fiber = fiber.return;
                    }
                    if (meta.msgId || meta.isOutgoing !== null || meta.videoUrl || meta.linkUrl) return meta;
                }
            }
        } catch (_) {}
        return meta;
    }

    function detectAlignRight(row, mainRect) {
        try {
            if (!mainRect || mainRect.width <= 0 || typeof row.getBoundingClientRect !== 'function') return false;
            const bubble = row.querySelector('[dir="auto"], video, img') || row;
            const rect = bubble.getBoundingClientRect();
            if (rect.width > 0) {
                const center = rect.left + rect.width / 2;
                return center > mainRect.left + mainRect.width * 0.55;
            }
        } catch (_) {}
        return false;
    }

    function getImgDimensions(img) {
        if (!img) return { w: 0, h: 0, rw: 0, rh: 0 };
        let rect = { width: 0, height: 0 };
        try {
            if (typeof img.getBoundingClientRect === 'function') {
                rect = img.getBoundingClientRect();
            }
        } catch (_) {}
        const rw = rect.width || 0;
        const rh = rect.height || 0;
        const w = rw > 0 ? rw : (img.width || img.naturalWidth || 0);
        const h = rh > 0 ? rh : (img.height || img.naturalHeight || 0);
        return { w: w, h: h, rw: rw, rh: rh };
    }

    function isLikelyAvatarImage(img) {
        if (!img) return false;
        if (knownAvatarImgSet.has(img)) return true;
        const dims = getImgDimensions(img);
        if (dims.rw > 0 && dims.rh > 0 && dims.rw <= 56 && dims.rh <= 56) {
            knownAvatarImgSet.add(img);
            return true;
        }
        const attrW = Number(img.getAttribute && img.getAttribute('width')) || img.width || 0;
        const attrH = Number(img.getAttribute && img.getAttribute('height')) || img.height || 0;
        if (attrW > 0 && attrH > 0 && attrW <= 56 && attrH <= 56) {
            knownAvatarImgSet.add(img);
            return true;
        }
        const src = img.currentSrc || img.src || '';
        if (
            src &&
            /\/t1\.30497-1\/|[/_](?:s|p)(?:32x32|40x40|48x48|50x50|60x60|80x80|100x100)\b|[?&]stp=[^&]*(?:s|p)(?:32x32|40x40|48x48|50x50|60x60|80x80|100x100)\b/i.test(
                src
            )
        ) {
            knownAvatarImgSet.add(img);
            return true;
        }
        const alt = (img.getAttribute && img.getAttribute('alt')) ? img.getAttribute('alt').trim() : (img.alt || '').trim();
        if (alt && /^(Đã xem|Seen by|Ảnh đại diện|Profile picture)/i.test(alt)) {
            knownAvatarImgSet.add(img);
            return true;
        }
        const w = dims.w;
        const h = dims.h;
        if (w > 0 && h > 0 && w <= 52 && h <= 52) {
            knownAvatarImgSet.add(img);
            return true;
        }
        if (
            w > 0 &&
            h > 0 &&
            w <= 120 &&
            h <= 120 &&
            Math.abs(w - h) <= 6 &&
            typeof img.closest === 'function' &&
            img.closest('a[href*="/t/"], a[role="link"], [aria-hidden="true"]')
        ) {
            knownAvatarImgSet.add(img);
            return true;
        }
        if (dims.rw === 0 && alt && w <= 200 && h <= 200 && Math.abs(w - h) <= 4) {
            const tTitle = getActiveThreadTitle();
            if (tTitle && tTitle !== 'Đoạn chat' && (alt === tTitle || tTitle.indexOf(alt) !== -1)) {
                knownAvatarImgSet.add(img);
                return true;
            }
        }
        return false;
    }

    function extractRowSender(row, alignRight, fiberMeta) {
        if (alignRight) return 'Bạn';
        if (fiberMeta && fiberMeta.senderName) return fiberMeta.senderName;
        const heading = row.querySelector('h4, h5');
        if (heading && heading.textContent) {
            const name = heading.textContent.trim();
            if (name && name.length <= 60 && !isUnsentTombstoneText(name)) {
                return name;
            }
        }
        const avatarImgs = row.querySelectorAll('img[alt]');
        for (let i = 0; i < avatarImgs.length; i++) {
            const av = avatarImgs[i];
            if (isLikelyAvatarImage(av)) {
                const alt = (av.getAttribute('alt') || '').trim();
                if (alt && alt.length <= 60 && !/^hình ảnh|image$/i.test(alt)) return alt;
            }
        }
        return getActiveThreadTitle() || 'Đối phương';
    }

    function ensureClonedBlobUrl(blobUrl) {
        if (!blobUrl || typeof blobUrl !== 'string' || !blobUrl.startsWith('blob:')) return;
        const resolved = resolvePlayableBlobUrl(blobUrl);
        if (resolved) {
            clonedBlobUrlMap[blobUrl] = resolved;
            return;
        }
        if (clonedBlobUrlMap[blobUrl]) return;
        clonedBlobUrlMap[blobUrl] = 'pending';
        try {
            fetch(blobUrl)
                .then(function (resp) {
                    return resp.blob();
                })
                .then(function (blob) {
                    if (blob && blob.size > 0) {
                        clonedBlobUrlMap[blobUrl] = URL.createObjectURL(blob);
                    } else {
                        delete clonedBlobUrlMap[blobUrl];
                    }
                })
                .catch(function () {
                    delete clonedBlobUrlMap[blobUrl];
                });
        } catch (_) {
            delete clonedBlobUrlMap[blobUrl];
        }
    }

    function trySnapshotImageDataUrl(img) {
        try {
            if (!img || !img.complete || img.naturalWidth < 24 || img.naturalHeight < 24) return '';
            const maxDim = 240;
            const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
            const canvas = document.createElement('canvas');
            canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
            canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
            const ctx = canvas.getContext('2d');
            if (!ctx) return '';
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            return canvas.toDataURL('image/webp', 0.75);
        } catch (_) {
            return '';
        }
    }

    function trySnapshotVideoFrameDataUrl(video) {
        try {
            if (!video || (video.readyState || 0) < 2 || !video.videoWidth || !video.videoHeight) return '';
            const maxDim = 280;
            const scale = Math.min(1, maxDim / Math.max(video.videoWidth, video.videoHeight));
            const canvas = document.createElement('canvas');
            canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
            canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
            const ctx = canvas.getContext('2d');
            if (!ctx) return '';
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            return canvas.toDataURL('image/webp', 0.72);
        } catch (_) {
            return '';
        }
    }

    function extractMessagePayload(row, mainRect, opts) {
        const allowHookMedia = !(opts && opts.detached);
        const media = [];
        const seenUrls = new Set();
        const xmaUsedImgs = new WeakSet();
        const xmaUsedTextNodes = new WeakSet();
        const videoUsedImgs = new WeakSet();
        let primaryLeaf = null;

        function isHiddenA11yNode(node) {
            if (!node) return false;
            if (allowHookMedia && typeof node.getBoundingClientRect === 'function') {
                const r = node.getBoundingClientRect();
                if (r.width > 0 && r.width <= 4 && r.height > 0 && r.height <= 4) return true;
            }
            const rawTxt = normalizeMsgText(node.textContent || '');
            if (rawTxt && SYSTEM_A11Y_NOISE_RE.test(rawTxt)) return true;
            return false;
        }

        // Thu thập liên kết <a href> (bao gồm XMA Link Preview card) trước để tránh trùng thumbnail/chữ card
        const anchors = [];
        if (row.tagName === 'A' && row.hasAttribute('href')) anchors.push(row);
        const childAnchors = row.querySelectorAll('a[href]');
        for (let i = 0; i < childAnchors.length; i++) anchors.push(childAnchors[i]);

        const linkItems = [];
        for (let i = 0; i < anchors.length; i++) {
            const a = anchors[i];
            if (a.closest('[data-n0-ui]')) continue;
            if (isHiddenA11yNode(a)) continue;
            const rawHref = a.getAttribute('href') || a.href || '';
            const cleanUrl = unwrapMessageLinkUrl(rawHref);
            if (!cleanUrl || seenUrls.has(cleanUrl)) continue;
            seenUrls.add(cleanUrl);

            let cardThumb = '';
            let cardTitle = '';
            const cardImgs = a.querySelectorAll('img');
            const nestedAutoLeaves = [];
            const nestedAutos = a.querySelectorAll('[dir="auto"]');
            for (let j = 0; j < nestedAutos.length; j++) {
                if (!nestedAutos[j].querySelector('[dir="auto"]')) nestedAutoLeaves.push(nestedAutos[j]);
            }

            if (cardImgs.length > 0 || nestedAutoLeaves.length >= 2) {
                for (let k = 0; k < cardImgs.length; k++) {
                    const ci = cardImgs[k];
                    if (isLikelyAvatarImage(ci)) continue;
                    xmaUsedImgs.add(ci);
                    if (!cardThumb) {
                        const cSrc = ci.currentSrc || ci.src || '';
                        if (cSrc && !cSrc.startsWith('data:image/svg')) {
                            cardThumb = trySnapshotImageDataUrl(ci) || cSrc;
                        }
                    }
                }
                let bestTitle = '';
                for (let j = 0; j < nestedAutoLeaves.length; j++) {
                    xmaUsedTextNodes.add(nestedAutoLeaves[j]);
                    const lt = (nestedAutoLeaves[j].innerText || nestedAutoLeaves[j].textContent || '').replace(/\s+/g, ' ').trim();
                    if (!lt || isSystemOrTimestampText(lt)) continue;
                    if (!bestTitle || (lt.length <= 140 && lt.length > bestTitle.length && !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(lt))) {
                        bestTitle = lt;
                    }
                }
                cardTitle = bestTitle;
            }

            const rawLabel = (a.innerText || a.textContent || '').replace(/\s+/g, ' ').trim();
            const label = cardTitle || (rawLabel && rawLabel.length <= 160 ? rawLabel : cleanUrl);
            linkItems.push({
                kind: 'link',
                src: cleanUrl,
                alt: label,
                thumb: cardThumb,
            });
            if (!primaryLeaf) primaryLeaf = a;
        }

        const collectedLines = [];
        const seenLine = new Set();
        const autoNodes = [];
        if (row.getAttribute && row.getAttribute('dir') === 'auto') autoNodes.push(row);
        const descAutos = row.querySelectorAll('[dir="auto"]');
        for (let i = 0; i < descAutos.length; i++) autoNodes.push(descAutos[i]);

        for (let i = 0; i < autoNodes.length; i++) {
            const node = autoNodes[i];
            if (node.closest && node.closest('[data-n0-ui]')) continue;
            if (node.closest && node.closest('[aria-label*="cảm xúc"], [aria-label*="react"], [aria-label*="Thích"]')) continue;
            if (node.closest && node.closest('h4, h5, [role="tooltip"], [role="menu"]')) continue;
            if (node.querySelector('[dir="auto"]')) continue;
            if (xmaUsedTextNodes.has(node)) continue;
            if (isHiddenA11yNode(node)) continue;
            const t = normalizeMsgText(node.innerText || node.textContent || '');
            if (!t || seenLine.has(t)) continue;
            if (node.closest && node.closest('button, [role="button"]') && !node.closest('a[href]') && !isUnsentTombstoneText(t)) {
                continue;
            }
            seenLine.add(t);
            collectedLines.push(t);
            if (!primaryLeaf) primaryLeaf = node;
        }

        // Quét dự phòng các thẻ lá không có dir="auto" (bao gồm chính row nếu row là <span>/<i>/<div> lá)
        const walkers = [];
        if (row.tagName === 'SPAN' || row.tagName === 'I' || row.tagName === 'EM' || row.tagName === 'DIV') {
            walkers.push(row);
        }
        const descWalkers = row.querySelectorAll('span, i, em, div');
        for (let i = 0; i < descWalkers.length; i++) walkers.push(descWalkers[i]);

        for (let i = 0; i < walkers.length; i++) {
            const el = walkers[i];
            if (el.closest && el.closest('[data-n0-ui]')) continue;
            if (el.closest && el.closest('[aria-label*="cảm xúc"], [aria-label*="react"], [aria-label*="Thích"]')) continue;
            if (el.closest && el.closest('h4, h5, [role="tooltip"], [role="menu"]')) continue;
            if (xmaUsedTextNodes.has(el)) continue;
            if (el.getAttribute && el.getAttribute('dir') === 'auto') continue;
            if (el !== row && el.closest && el.closest('[dir="auto"]')) {
                const candidateRaw = normalizeMsgText(el.textContent || '');
                if (!isUnsentTombstoneText(candidateRaw)) continue;
            }
            if (el.querySelector('span, i, em, div')) {
                let directText = '';
                if (el.childNodes && el.childNodes.length > 0) {
                    for (let c = 0; c < el.childNodes.length; c++) {
                        if (el.childNodes[c].nodeType === 3) {
                            directText += ' ' + (el.childNodes[c].nodeValue || '');
                        }
                    }
                }
                const cleanDirect = normalizeMsgText(directText);
                if (cleanDirect && isUnsentTombstoneText(cleanDirect) && !seenLine.has(cleanDirect)) {
                    seenLine.add(cleanDirect);
                    collectedLines.push(cleanDirect);
                    if (!primaryLeaf) primaryLeaf = el;
                }
                continue;
            }
            if (isHiddenA11yNode(el)) continue;
            const s = normalizeMsgText(el.textContent || '');
            if (!s || seenLine.has(s)) continue;
            if (el.closest && el.closest('button, [role="button"]') && !el.closest('a[href]') && !isUnsentTombstoneText(s)) {
                continue;
            }
            seenLine.add(s);
            collectedLines.push(s);
            if (!primaryLeaf) primaryLeaf = el;
        }

        const fiberMeta = extractMessageMetaFromFiber(primaryLeaf || row);
        const alignRight = fiberMeta.isOutgoing !== null ? fiberMeta.isOutgoing : detectAlignRight(row, mainRect);
        const sender = extractRowSender(row, alignRight, fiberMeta);
        const headingEl = row.querySelector('h4, h5');
        const headingName = headingEl ? normalizeMsgText(headingEl.textContent || '') : '';
        const threadTitle = normalizeMsgText(getActiveThreadTitle());

        const tombstoneLines = [];
        const contentLines = [];
        for (let i = 0; i < collectedLines.length; i++) {
            const line = collectedLines[i];
            if (isUnsentTombstoneText(line)) {
                tombstoneLines.push(line);
                continue;
            }
            if (isSystemOrTimestampText(line)) {
                continue;
            }
            const lineLower = line.toLowerCase();
            const isSenderAlias =
                line === headingName ||
                (sender && line === sender) ||
                (threadTitle &&
                    threadTitle !== 'Đoạn chat' &&
                    (line === threadTitle ||
                        (line.length >= 2 && line.length <= 40 && threadTitle.toLowerCase().indexOf(lineLower) !== -1)));
            if (isSenderAlias) {
                continue;
            }
            contentLines.push(line);
        }

        const hasTombstoneLine = tombstoneLines.length > 0;
        if (!hasTombstoneLine && collectedLines.length > 0) {
            const nonSys = [];
            for (let i = 0; i < collectedLines.length; i++) {
                const l = collectedLines[i];
                if (!isSystemOrTimestampText(l)) {
                    nonSys.push(l);
                }
            }
            if (nonSys.length >= 2) {
                const firstLower = nonSys[0].toLowerCase();
                const firstIsSender =
                    nonSys[0] === headingName ||
                    (sender && nonSys[0] === sender) ||
                    (threadTitle &&
                        threadTitle !== 'Đoạn chat' &&
                        (nonSys[0] === threadTitle ||
                            (nonSys[0].length >= 2 && nonSys[0].length <= 40 && threadTitle.toLowerCase().indexOf(firstLower) !== -1)));
                if (firstIsSender) nonSys.shift();
            }
            contentLines.length = 0;
            for (let i = 0; i < nonSys.length; i++) {
                contentLines.push(nonSys[i]);
            }
        }

        if (fiberMeta.linkUrl && !seenUrls.has(fiberMeta.linkUrl)) {
            seenUrls.add(fiberMeta.linkUrl);
            linkItems.push({
                kind: 'link',
                src: fiberMeta.linkUrl,
                alt: fiberMeta.linkTitle || fiberMeta.linkUrl,
            });
        }

        // Thu thập <video> trước để nhận diện poster từ img kề (nếu video chưa nạp khung hình)
        const videos = [];
        if (row.tagName === 'VIDEO') videos.push(row);
        const childVideos = row.querySelectorAll('video');
        for (let i = 0; i < childVideos.length; i++) videos.push(childVideos[i]);

        const rowImgs = [];
        if (row.tagName === 'IMG') rowImgs.push(row);
        const descImgs = row.querySelectorAll('img');
        for (let i = 0; i < descImgs.length; i++) rowImgs.push(descImgs[i]);
        let addedVideoCount = 0;
        for (let i = 0; i < videos.length; i++) {
            const v = videos[i];
            if (v.closest('[data-n0-ui]')) continue;
            let src = v.currentSrc || v.src || '';
            if (!src) {
                const sourceEl = v.querySelector('source[src]');
                if (sourceEl) src = sourceEl.getAttribute('src') || sourceEl.src || '';
            }
            const fallbackUrl = fiberMeta.videoUrl || (src && !src.startsWith('blob:') ? src : '');
            let posterUrl = v.getAttribute('poster') || fiberMeta.posterUrl || '';
            if (allowHookMedia && (v.readyState || 0) < 2 && !mediaHookedSet.has(v)) {
                mediaHookedSet.add(v);
                const onVideoReady = function () {
                    setTimeout(scanAntiRecall, 30);
                };
                v.addEventListener('loadedmetadata', onVideoReady, { once: true });
                v.addEventListener('loadeddata', onVideoReady, { once: true });
            }
            if (src.startsWith('blob:')) {
                ensureClonedBlobUrl(src);
            }
            const frameThumb = trySnapshotVideoFrameDataUrl(v);
            if (!frameThumb && !posterUrl) {
                for (let k = 0; k < rowImgs.length; k++) {
                    const rImg = rowImgs[k];
                    if (rImg.closest('[data-n0-ui]') || xmaUsedImgs.has(rImg) || isLikelyAvatarImage(rImg)) continue;
                    const rSrc = rImg.currentSrc || rImg.src || '';
                    if (rSrc && !rSrc.startsWith('data:image/svg')) {
                        posterUrl = trySnapshotImageDataUrl(rImg) || rSrc;
                        videoUsedImgs.add(rImg);
                        break;
                    }
                }
            }
            if (src || fallbackUrl || frameThumb || posterUrl) {
                media.push({
                    kind: 'video',
                    src: src || fallbackUrl,
                    fallbackUrl: fallbackUrl,
                    blobKey: src.startsWith('blob:') ? src : '',
                    poster: frameThumb || posterUrl,
                    alt: 'Video đính kèm',
                });
                addedVideoCount++;
                if (!primaryLeaf) primaryLeaf = v;
            }
        }

        // Video card chưa bấm phát (Messenger chỉ render ảnh thumbnail + nút Phát video + metadata trong Fiber)
        if (
            addedVideoCount === 0 &&
            (fiberMeta.isVideo ||
                fiberMeta.videoUrl ||
                row.querySelector('[aria-label*="Phát video"], [aria-label*="Play video"], [data-testid*="video"]'))
        ) {
            let cardPoster = fiberMeta.posterUrl || '';
            for (let k = 0; k < rowImgs.length && !cardPoster; k++) {
                const rImg = rowImgs[k];
                if (rImg.closest('[data-n0-ui]') || xmaUsedImgs.has(rImg) || isLikelyAvatarImage(rImg)) continue;
                const rSrc = rImg.currentSrc || rImg.src || '';
                if (rSrc && !rSrc.startsWith('data:image/svg')) {
                    cardPoster = trySnapshotImageDataUrl(rImg) || rSrc;
                    videoUsedImgs.add(rImg);
                }
            }
            if (fiberMeta.videoUrl || cardPoster) {
                media.push({
                    kind: 'video',
                    src: fiberMeta.videoUrl || '',
                    fallbackUrl: fiberMeta.videoUrl || '',
                    blobKey: '',
                    poster: cardPoster,
                    alt: 'Video đính kèm',
                });
                addedVideoCount++;
            }
        }

        for (let i = 0; i < rowImgs.length; i++) {
            const img = rowImgs[i];
            if (img.closest('[data-n0-ui]')) continue;
            if (xmaUsedImgs.has(img) || videoUsedImgs.has(img)) continue;
            if (isLikelyAvatarImage(img)) continue;
            const dims = getImgDimensions(img);
            const src = img.currentSrc || img.src || '';
            if (!src || src.startsWith('data:image/svg')) continue;
            if (allowHookMedia && !img.complete && !mediaHookedSet.has(img)) {
                mediaHookedSet.add(img);
                img.addEventListener(
                    'load',
                    function () {
                        setTimeout(scanAntiRecall, 30);
                    },
                    { once: true }
                );
            }
            if (dims.w === 0 && dims.h === 0) continue;
            if (src.startsWith('blob:')) {
                ensureClonedBlobUrl(src);
            }
            const thumb = trySnapshotImageDataUrl(img);
            media.push({
                kind: 'image',
                src: thumb || src,
                fallbackUrl: src,
                blobKey: src.startsWith('blob:') ? src : '',
                alt: (img.getAttribute('alt') || 'Hình ảnh').trim(),
            });
            if (!primaryLeaf) primaryLeaf = img;
        }

        for (let i = 0; i < linkItems.length; i++) {
            media.push(linkItems[i]);
        }

        const hasVisualMedia = media.some(function (m) {
            return m.kind === 'image' || m.kind === 'video';
        });
        const tombstone = hasTombstoneLine && !hasVisualMedia && linkItems.length === 0 && contentLines.length === 0;
        const text = tombstone ? tombstoneLines.join(' ').trim() : contentLines.join('\n').trim();

        if (!tombstone && text) {
            const textUrls = text.match(/(?:https?:\/\/|www\.)[^\s<>"']+/gi);
            if (textUrls) {
                for (let u = 0; u < textUrls.length; u++) {
                    const cleanTextUrl = unwrapMessageLinkUrl(textUrls[u].replace(/[),.;!?]+$/, ''));
                    if (!cleanTextUrl || seenUrls.has(cleanTextUrl)) continue;
                    seenUrls.add(cleanTextUrl);
                    media.push({
                        kind: 'link',
                        src: cleanTextUrl,
                        alt: cleanTextUrl,
                    });
                }
            }
        }

        const sysOrTime = !tombstone && media.length === 0 && (!text || isSystemOrTimestampText(text));

        return {
            text: text,
            media: media,
            sender: sender,
            alignRight: alignRight,
            isTombstone: tombstone,
            isSystemOrTime: sysOrTime,
            msgId: fiberMeta.msgId || '',
            fiberKey: fiberMeta.msgId || '',
            timeLabel: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
        };
    }

    function recordRecalledMessage(entry) {
        if (!entry || !isValidCapturedContent(entry.text, entry.media)) return false;
        const fingerprint = (entry.threadKey || '') + '|' + buildMessageKey(entry);
        const now = Date.now();
        for (let i = 0; i < Math.min(recalledLog.length, 20); i++) {
            const item = recalledLog[i];
            if (item && item.fingerprint === fingerprint && now - (item.recalledAt || 0) < 30000) {
                return false;
            }
        }

        const record = {
            id: entry.id || 'rc_' + now + '_' + Math.random().toString(36).slice(2, 7),
            fingerprint: fingerprint,
            threadKey: entry.threadKey || getCurrentThreadKey(),
            threadTitle: entry.threadTitle || getActiveThreadTitle(),
            sender: entry.sender || 'Người gửi',
            text: entry.text || '',
            media: Array.isArray(entry.media) ? entry.media : [],
            alignRight: !!entry.alignRight,
            msgId: entry.msgId || '',
            prevSig: entry.prevSig || '',
            nextSig: entry.nextSig || '',
            timeLabel: entry.timeLabel || new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
            recalledAt: now,
            source: entry.source || 'thread',
        };
        recalledLog.unshift(record);
        if (recalledLog.length > 200) recalledLog.length = 200;
        recalledLogDirty = true;
        scheduleSaveAntiRecall(true);

        if (window.ipc) {
            let preview = record.text;
            if (!preview && record.media && record.media.length > 0) {
                const k = record.media[0].kind;
                preview = k === 'video' ? '[Video đính kèm]' : k === 'link' ? record.media[0].src || '[Liên kết]' : '[Hình ảnh]';
            }
            if (!preview) preview = '[Tin nhắn]';
            window.ipc.postMessage(
                JSON.stringify({
                    type: 'ShowNotification',
                    payload: {
                        title: 'Đã thu hồi • ' + record.sender,
                        body: preview.slice(0, 140),
                    },
                })
            );
            sendHost('DiagLog', {
                message:
                    '[AntiRecall Restore] thread=' +
                    record.threadKey +
                    ' sender=' +
                    record.sender +
                    ' msgId=' +
                    (record.msgId || 'pos') +
                    ' media=' +
                    (record.media ? record.media.length : 0),
            });
        }
        return true;
    }

    function findTombstoneBubbleHost(row) {
        const existingOrig = row.querySelector('.n0-tombstone-orig');
        if (existingOrig) {
            return { hideEl: existingOrig, mountParent: existingOrig.parentElement || row };
        }
        const candidates = row.querySelectorAll('[dir="auto"], span, i, em, div');
        let textEl = null;
        for (let i = 0; i < candidates.length; i++) {
            const c = candidates[i];
            if (c.closest('[data-n0-ui="anti-recall"]')) continue;
            if (c.querySelector('[dir="auto"], span, i, em, div')) continue;
            const t = normalizeMsgText(c.textContent || '');
            if (isUnsentTombstoneText(t)) {
                textEl = c;
            }
        }
        if (!textEl) {
            for (let i = 0; i < candidates.length; i++) {
                const c = candidates[i];
                if (c.closest('[data-n0-ui="anti-recall"]')) continue;
                const t = normalizeMsgText(c.textContent || '');
                if (isUnsentTombstoneText(t)) {
                    textEl = c;
                }
            }
        }
        if (!textEl && isUnsentTombstoneText(row.textContent || '')) {
            const origWrap = document.createElement('span');
            origWrap.className = 'n0-tombstone-orig';
            if (row.childNodes && row.childNodes.length > 0) {
                const nodes = Array.prototype.slice.call(row.childNodes);
                for (let n = 0; n < nodes.length; n++) {
                    if (nodes[n].nodeType === 1 && nodes[n].getAttribute && nodes[n].getAttribute('data-n0-ui')) continue;
                    origWrap.appendChild(nodes[n]);
                }
            } else {
                origWrap.textContent = row.textContent || '';
                row.textContent = '';
            }
            row.appendChild(origWrap);
            return { hideEl: origWrap, mountParent: row };
        }
        if (!textEl) return { hideEl: null, mountParent: row };

        let bubble = textEl;
        for (let step = 0; step < 3; step++) {
            const p = bubble.parentElement;
            if (!p || p === row || p.getAttribute('role') === 'row') break;
            if (p.querySelector('img')) break;
            bubble = p;
        }
        const mountParent =
            bubble.parentElement && bubble.parentElement !== row && (!row.contains || row.contains(bubble.parentElement))
                ? bubble.parentElement
                : row;
        return {
            hideEl: bubble !== row ? bubble : null,
            mountParent: mountParent,
        };
    }

    let lastDiagSig = '';
    function emitAntiRecallDiag(navLinksCount, rowsCount, tombstonesCount, visibleCount, recalledCount) {
        const ws = protocolVault.stats.wsOpen;
        const frames = protocolVault.stats.wsFrames;
        const idb = protocolVault.stats.idbWrites;
        const lockedBlobs = protectedBlobMap.size;
        const blockedRevokes = protocolVault.stats.blockedRevokes;
        const seenBlk = protocolVault.stats.blockedSeen || 0;
        const typBlk = protocolVault.stats.blockedTyping || 0;
        const modHooks = protocolVault.stats.modHooks || 0;
        const sig = [
            navLinksCount,
            rowsCount,
            tombstonesCount,
            visibleCount,
            recalledCount,
            ws,
            frames > 0 ? 1 : 0,
            idb > 0 ? 1 : 0,
            lockedBlobs,
            blockedRevokes,
            seenBlk,
            typBlk,
            modHooks,
        ].join('|');
        if (sig === lastDiagSig) return;
        lastDiagSig = sig;
        sendHost('DiagLog', {
            message:
                'antiRecall thread=' +
                getCurrentThreadKey() +
                ' navLinks=' +
                navLinksCount +
                ' rows=' +
                rowsCount +
                ' tombstones=' +
                tombstonesCount +
                ' visibleMsgs=' +
                visibleCount +
                ' recalledLog=' +
                recalledCount +
                ' ws=' +
                ws +
                ' frames=' +
                frames +
                ' idb=' +
                idb +
                ' lockedBlobs=' +
                lockedBlobs +
                ' blockedRevokes=' +
                blockedRevokes +
                ' modHooks=' +
                modHooks +
                ' seenBlk=' +
                seenBlk +
                ' typBlk=' +
                typBlk,
        });
    }

    function createVideoPosterCard(m) {
        const posterBox = document.createElement('div');
        posterBox.className = 'n0-recalled-video-poster';
        const img = document.createElement('img');
        img.src = m.poster;
        img.alt = m.alt || 'Video đã thu hồi';
        img.className = 'n0-recalled-img';
        const label = document.createElement('span');
        label.className = 'n0-recalled-video-badge';
        label.textContent = 'Video đã thu hồi';
        posterBox.appendChild(img);
        posterBox.appendChild(label);
        return posterBox;
    }

    function renderRecalledMediaList(parentEl, media) {
        if (!parentEl || !Array.isArray(media) || media.length === 0) return;
        const mediaWrap = document.createElement('div');
        mediaWrap.className = 'n0-recalled-media';

        for (let i = 0; i < media.length; i++) {
            const m = media[i];
            const liveCloned = resolvePlayableBlobUrl(m.blobKey || m.src || '');

            if (m.kind === 'image') {
                const imgSrc = (m.src && m.src.startsWith('data:') ? m.src : '') || liveCloned || m.src || m.fallbackUrl || '';
                if (!imgSrc) continue;
                const img = document.createElement('img');
                img.src = imgSrc;
                img.alt = m.alt || 'Ảnh đã thu hồi';
                img.className = 'n0-recalled-img';
                img.addEventListener('error', function () {
                    if (m.fallbackUrl && img.src !== m.fallbackUrl) {
                        img.src = m.fallbackUrl;
                    }
                });
                mediaWrap.appendChild(img);
            } else if (m.kind === 'video') {
                const directUrl =
                    (m.src && !m.src.startsWith('blob:') ? m.src : '') ||
                    (m.fallbackUrl && !m.fallbackUrl.startsWith('blob:') ? m.fallbackUrl : '');
                const videoSrc = liveCloned || directUrl || '';
                if (videoSrc) {
                    const video = document.createElement('video');
                    video.className = 'n0-recalled-video';
                    video.controls = true;
                    video.playsInline = true;
                    video.preload = 'metadata';
                    if (m.poster) video.poster = m.poster;
                    video.src = videoSrc;
                    let triedFallback = false;
                    video.addEventListener('error', function () {
                        if (!triedFallback && m.fallbackUrl && video.src !== m.fallbackUrl) {
                            triedFallback = true;
                            video.src = m.fallbackUrl;
                            return;
                        }
                        if (m.poster && video.parentElement) {
                            video.parentElement.replaceChild(createVideoPosterCard(m), video);
                        }
                    });
                    mediaWrap.appendChild(video);
                } else if (m.poster) {
                    mediaWrap.appendChild(createVideoPosterCard(m));
                } else {
                    const att = document.createElement('div');
                    att.className = 'n0-recalled-attachment';
                    att.textContent = 'Video đã thu hồi';
                    mediaWrap.appendChild(att);
                }
            } else if (m.kind === 'link' && m.src) {
                const linkEl = document.createElement('a');
                linkEl.className = 'n0-recalled-link';
                linkEl.href = m.src;
                linkEl.target = '_blank';
                linkEl.rel = 'noopener noreferrer';
                const labelText = m.alt && m.alt !== m.src ? m.alt + ': ' + m.src : m.src;
                if (m.thumb) {
                    const thumbImg = document.createElement('img');
                    thumbImg.className = 'n0-recalled-link-thumb';
                    thumbImg.src = m.thumb;
                    thumbImg.alt = '';
                    const spanTxt = document.createElement('span');
                    spanTxt.textContent = labelText;
                    linkEl.appendChild(thumbImg);
                    linkEl.appendChild(spanTxt);
                } else {
                    linkEl.textContent = labelText;
                }
                bindAntiRecallAction(linkEl, function () {
                    sendHost('OpenExternal', { url: m.src });
                });
                mediaWrap.appendChild(linkEl);
            } else if (m.src) {
                const att = document.createElement('div');
                att.className = 'n0-recalled-attachment';
                att.textContent = (m.alt || 'Đính kèm') + ': ' + m.src;
                mediaWrap.appendChild(att);
            }
        }

        if (mediaWrap.children.length > 0) {
            parentEl.appendChild(mediaWrap);
        }
    }

    function bindAntiRecallAction(el, fn) {
        if (!el || typeof fn !== 'function') return;
        el.setAttribute('data-n0-action', '1');
        actionHandlerMap.set(el, fn);
        el.addEventListener('click', function (e) {
            if (e.__n0Handled) return;
            e.__n0Handled = true;
            e.preventDefault();
            e.stopPropagation();
            fn();
        });
    }

    function buildInlineMessageBubble(record, onToggleOriginal) {
        const wrap = document.createElement('div');
        wrap.className = 'n0-recalled-bubble-wrap ' + (record.alignRight ? 'n0-align-right' : 'n0-align-left');
        wrap.setAttribute('data-n0-ui', 'anti-recall');

        const bubble = document.createElement('div');
        bubble.className = 'n0-recalled-bubble ' + (record.alignRight ? 'n0-bubble-self' : 'n0-bubble-peer');

        const isPureSingleLinkText =
            record.text &&
            Array.isArray(record.media) &&
            record.media.length === 1 &&
            record.media[0].kind === 'link' &&
            record.text.trim() === (record.media[0].src || '').trim();

        if (record.text && !isPureSingleLinkText) {
            const textEl = document.createElement('div');
            textEl.className = 'n0-recalled-text';
            textEl.textContent = record.text;
            bubble.appendChild(textEl);
        }

        renderRecalledMediaList(bubble, record.media);

        const tagRow = document.createElement('div');
        tagRow.className = 'n0-recalled-tag-row';
        const tag = document.createElement('span');
        tag.className = 'n0-recalled-tag';
        tag.textContent = 'Đã thu hồi';
        if (typeof onToggleOriginal === 'function') {
            tag.style.cursor = 'pointer';
            tag.title = 'Nhấn để xem/ẩn thông báo thu hồi gốc';
            bindAntiRecallAction(tag, onToggleOriginal);
        }
        tagRow.appendChild(tag);

        if (record.timeLabel) {
            const tm = document.createElement('span');
            tm.className = 'n0-recalled-time';
            tm.textContent = record.timeLabel;
            tagRow.appendChild(tm);
        }

        wrap.appendChild(bubble);
        wrap.appendChild(tagRow);
        return wrap;
    }

    function renderRestoredBubbleInRow(row, record) {
        if (!row || !record) return;
        const existingUi = row.querySelector('[data-n0-ui="anti-recall"]');
        const existingMode = existingUi ? existingUi.getAttribute('data-n0-mode') : '';
        if (existingMode === 'restored' || existingMode === 'collapsed') return;

        runWithAntiRecallDomLock(function () {
            if (existingUi) existingUi.remove();

            const host = findTombstoneBubbleHost(row);
            if (host.hideEl && row.getAttribute('data-n0-collapsed') !== '1') {
                host.hideEl.classList.add('n0-tombstone-hidden');
            }

            let wrap = null;
            if (row.getAttribute('data-n0-collapsed') === '1') {
                wrap = document.createElement('div');
                wrap.className = 'n0-recalled-tag-row';
                wrap.setAttribute('data-n0-ui', 'anti-recall');
                wrap.setAttribute('data-n0-mode', 'collapsed');
                const restoreBtn = document.createElement('button');
                restoreBtn.type = 'button';
                restoreBtn.className = 'n0-recall-inline-btn';
                restoreBtn.textContent = 'Khôi phục tin nhắn';
                bindAntiRecallAction(restoreBtn, function () {
                    runWithAntiRecallDomLock(function () {
                        row.removeAttribute('data-n0-collapsed');
                        if (host.hideEl) host.hideEl.classList.add('n0-tombstone-hidden');
                        wrap.remove();
                    });
                    renderRestoredBubbleInRow(row, record);
                });
                wrap.appendChild(restoreBtn);
            } else {
                wrap = buildInlineMessageBubble(record, function () {
                    runWithAntiRecallDomLock(function () {
                        row.setAttribute('data-n0-collapsed', '1');
                        if (host.hideEl) host.hideEl.classList.remove('n0-tombstone-hidden');
                        wrap.remove();
                    });
                    renderRestoredBubbleInRow(row, record);
                });
                wrap.setAttribute('data-n0-mode', 'restored');
            }

            const parent = host.mountParent || row;
            if (record.id) wrap.setAttribute('data-n0-rec-id', record.id);
            if (host.hideEl && host.hideEl.parentElement === parent) {
                parent.insertBefore(wrap, host.hideEl.nextSibling);
            } else {
                parent.appendChild(wrap);
            }
        });
    }

    function collectBoundRecordIdsAndKeys(threadKey) {
        const boundIds = new Set();
        const boundKeys = new Set();
        const existingUis = document.querySelectorAll('[data-n0-ui="anti-recall"][data-n0-rec-id]');
        for (let i = 0; i < existingUis.length; i++) {
            const rid = existingUis[i].getAttribute('data-n0-rec-id');
            if (rid) boundIds.add(rid);
        }
        const st = threadLedgers[threadKey];
        if (st && Array.isArray(st.stableViewport)) {
            for (let i = 0; i < st.stableViewport.length; i++) {
                boundKeys.add(buildMessageKey(st.stableViewport[i]));
            }
        }
        return { boundIds: boundIds, boundKeys: boundKeys };
    }

    function collectUnboundCandidatesForThread(threadKey) {
        const ref = collectBoundRecordIdsAndKeys(threadKey);
        const out = [];
        const seen = new Set();

        function addIfValid(c) {
            if (!c || !isValidCapturedContent(c.text, c.media)) return;
            if (c.id && ref.boundIds.has(c.id)) return;
            const k = c.id || buildMessageKey(c);
            if (!k || seen.has(k)) return;
            seen.add(k);
            out.push(c);
        }

        const st = threadLedgers[threadKey];
        if (st && Array.isArray(st.recalledRecords)) {
            for (let r = st.recalledRecords.length - 1; r >= 0; r--) {
                addIfValid(st.recalledRecords[r]);
            }
        }
        if (sidebarPendingRecallByThread[threadKey]) {
            addIfValid(sidebarPendingRecallByThread[threadKey]);
        }
        for (let i = 0; i < recalledLog.length; i++) {
            const item = recalledLog[i];
            if (item && item.threadKey === threadKey) addIfValid(item);
        }
        if (st && Array.isArray(st.entries)) {
            for (let i = st.entries.length - 1; i >= 0; i--) {
                const e = st.entries[i];
                if (!e || ref.boundKeys.has(buildMessageKey(e))) continue;
                addIfValid(e);
            }
        }
        return out;
    }

    function resolveLiveFallbackForTombstone(row, threadKey, prevSig, nextSig, alignRight) {
        if (!row) return null;
        if (rowResolvedMap.has(row)) return rowResolvedMap.get(row);
        if (rowSnapshotMap.has(row)) return rowSnapshotMap.get(row);

        const st = threadLedgers[threadKey];
        const fMeta = extractMessageMetaFromFiber(row);
        if (st && fMeta.msgId) {
            const byId = (st.recalledById && st.recalledById[fMeta.msgId]) || (st.byMsgId && st.byMsgId[fMeta.msgId]);
            if (byId && isValidCapturedContent(byId.text, byId.media)) return byId;
        }

        const candidates = collectUnboundCandidatesForThread(threadKey);
        if (prevSig) {
            for (let i = 0; i < candidates.length; i++) {
                if (candidates[i].prevSig === prevSig || candidates[i].anchorPrevText === prevSig) return candidates[i];
            }
        }
        if (nextSig) {
            for (let i = 0; i < candidates.length; i++) {
                if (candidates[i].nextSig === nextSig) return candidates[i];
            }
        }
        for (let i = 0; i < candidates.length; i++) {
            if (candidates[i].alignRight === alignRight) return candidates[i];
        }
        return candidates.length > 0 ? candidates[0] : null;
    }

    function renderUnmatchedTombstoneUi(row, threadKey, prevSig, nextSig, alignRight, unboundCount) {
        if (!row) return;
        const existing = row.querySelector('[data-n0-ui="anti-recall"]');
        const mode = existing ? existing.getAttribute('data-n0-mode') : '';
        if (mode === 'restored' || mode === 'collapsed') return;

        const targetMode = unboundCount > 0 ? 'manual-btn' : 'preapp-tag';
        if (existing && mode === targetMode) return;

        runWithAntiRecallDomLock(function () {
            if (existing) existing.remove();
            const host = findTombstoneBubbleHost(row);
            const bar = document.createElement('div');
            bar.className = 'n0-recalled-tag-row n0-manual-restore-bar';
            bar.setAttribute('data-n0-ui', 'anti-recall');
            bar.setAttribute('data-n0-mode', targetMode);

            if (targetMode === 'manual-btn') {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'n0-recall-inline-btn n0-recall-inline-primary';
                btn.textContent = 'Khôi phục';
                btn.title = 'Nhấn để khôi phục ngay nội dung tin nhắn đã thu hồi';

                const status = document.createElement('span');
                status.className = 'n0-recall-inline-hint';

                bindAntiRecallAction(btn, function () {
                    const matched = resolveLiveFallbackForTombstone(row, threadKey, prevSig, nextSig, alignRight);
                    if (matched) {
                        if (!matched.id) {
                            matched.id = 'rr_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
                        }
                        if (sidebarPendingRecallByThread[threadKey] === matched) {
                            delete sidebarPendingRecallByThread[threadKey];
                        }
                        runWithAntiRecallDomLock(function () {
                            bar.remove();
                        });
                        rowResolvedMap.set(row, matched);
                        renderRestoredBubbleInRow(row, matched);
                        recordRecalledMessage({
                            id: matched.id,
                            threadKey: threadKey,
                            threadTitle: getActiveThreadTitle(),
                            sender: matched.sender,
                            text: matched.text,
                            media: matched.media,
                            alignRight: matched.alignRight,
                            msgId: matched.msgId,
                            prevSig: matched.prevSig || prevSig,
                            nextSig: matched.nextSig || nextSig,
                            timeLabel: matched.timeLabel,
                            source: 'manual',
                        });
                        return;
                    }

                    const threadMatches = recalledLog.filter(function (it) {
                        return it && it.threadKey === threadKey;
                    });
                    if (threadMatches.length > 0) {
                        status.textContent = 'Không tìm thấy vị trí khớp (' + threadMatches.length + ' tin đã lưu)';
                    } else {
                        status.textContent = 'Tin đã bị xóa trước khi mở app';
                    }
                });

                bar.appendChild(btn);
                bar.appendChild(status);
            } else {
                const tag = document.createElement('span');
                tag.className = 'n0-preapp-tag';
                tag.textContent = 'Đã thu hồi trước khi mở app';
                tag.title = 'Tin nhắn đã bị thu hồi trước khi ứng dụng chạy';

                const hint = document.createElement('span');
                hint.className = 'n0-recall-inline-hint';

                bindAntiRecallAction(tag, function () {
                    const threadMatches = recalledLog.filter(function (it) {
                        return it && it.threadKey === threadKey;
                    });
                    if (threadMatches.length > 0) {
                        hint.textContent = 'Đã ghi nhận ' + threadMatches.length + ' tin thu hồi trước đó trong phiên này';
                    } else {
                        hint.textContent = 'Không có bản lưu trước khi mở app';
                    }
                });

                bar.appendChild(tag);
                bar.appendChild(hint);
            }

            const parent = host.mountParent || row;
            if (host.hideEl && host.hideEl.parentElement === parent) {
                parent.insertBefore(bar, host.hideEl.nextSibling);
            } else {
                parent.appendChild(bar);
            }
        });
    }

    const SIDEBAR_NOISE_RE = /^(đang hoạt động|active now|đoạn chat|tin nhắn chưa đọc:?|unread messages?:?|bạn:?|·)$/i;

    function scanSidebarPreviews() {
        let items = document.querySelectorAll('a[href*="/t/"], a[href*="/e2ee/t/"]');
        if (!items || items.length === 0) {
            items = document.querySelectorAll('[aria-label*="Đoạn chat"] [role="row"], [aria-label*="Chats"] [role="row"]');
        }

        const activeThreadKey = getCurrentThreadKey();
        let count = 0;

        for (let i = 0; i < items.length; i++) {
            const link = items[i];
            const href = link.getAttribute('href') || '';
            const match = href.match(/\/(?:e2ee\/)?t\/([^/?#]+)/);
            const threadId = match ? match[1] : '';

            const spans = link.querySelectorAll('span');
            const parts = [];
            for (let j = 0; j < spans.length; j++) {
                const sp = spans[j];
                if (sp.querySelector('span')) continue;
                const r = sp.getBoundingClientRect();
                if (r.width <= 3 || r.height <= 3) continue;
                const s = (sp.textContent || '').replace(/\s+/g, ' ').trim();
                if (!s || SIDEBAR_NOISE_RE.test(s) || /tin nhắn chưa đọc/i.test(s) || /unread message/i.test(s)) {
                    continue;
                }
                if (parts.indexOf(s) === -1) parts.push(s);
            }
            if (parts.length < 2) continue;

            const title = parts[0];
            const key = threadId || 'name:' + title;
            let preview = parts
                .slice(1)
                .filter(function (p) {
                    return !/^\d+\s*(phút|giờ|giây|ngày|min|hr|sec|day)$/i.test(p);
                })
                .join(' ')
                .replace(/\s*·\s*\d+\s*(phút|giờ|giây|ngày|min|hr|sec|day).*$/i, '')
                .trim();

            if (!preview || isSystemOrTimestampText(preview)) continue;
            count++;

            const prev = sidebarPreviewCache[key];
            if (isUnsentTombstoneText(preview)) {
                if (
                    prev &&
                    prev.preview &&
                    !isUnsentTombstoneText(prev.preview) &&
                    !isSystemOrTimestampText(prev.preview) &&
                    !prev.loggedRecall
                ) {
                    prev.loggedRecall = true;
                    if (threadId && threadId !== activeThreadKey) {
                        const isSelfPrefix = /^Bạn:\s*/i.test(prev.preview);
                        const cleanText = isSelfPrefix ? prev.preview.replace(/^Bạn:\s*/i, '').trim() : prev.preview;
                        if (cleanText && !isSystemOrTimestampText(cleanText)) {
                            const sidebarRec = {
                                id: 'sb_' + Date.now() + '_' + i,
                                threadKey: threadId,
                                threadTitle: title,
                                sender: isSelfPrefix ? 'Bạn' : title,
                                text: cleanText,
                                media: [],
                                alignRight: isSelfPrefix,
                                timeLabel: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
                                source: 'sidebar',
                            };
                            sidebarPendingRecallByThread[threadId] = sidebarRec;
                            recordRecalledMessage(sidebarRec);
                        }
                    }
                }
            } else {
                sidebarPreviewCache[key] = {
                    title: title,
                    preview: preview,
                    loggedRecall: false,
                    ts: Date.now(),
                };
            }
        }
        return count;
    }

    function getActiveMainPanel() {
        const mains = document.querySelectorAll('[role="main"]');
        let best = null;
        let bestArea = 0;
        for (let i = 0; i < mains.length; i++) {
            const m = mains[i];
            const rect = m.getBoundingClientRect();
            const area = rect.width * rect.height;
            if (rect.width > 120 && rect.height > 120 && area > bestArea) {
                best = m;
                bestArea = area;
            }
        }
        return best;
    }

    function discoverChatRows(main) {
        const mainRect = main.getBoundingClientRect();
        const composer = main.querySelector('[role="textbox"], [contenteditable="true"]');
        const compRect = composer ? composer.getBoundingClientRect() : null;

        const chatLeft = compRect && compRect.width > 100 ? compRect.left - 84 : mainRect.left;
        const chatRight = compRect && compRect.width > 100 ? compRect.right + 84 : mainRect.right;
        const chatTop = mainRect.top + 56;
        const chatBottom = compRect && compRect.top > chatTop + 40 ? compRect.top - 6 : mainRect.bottom - 50;

        const seeds = main.querySelectorAll('[dir="auto"], span, i, em, img, video, a[href]');
        const msgRows = [];
        const seenRows = new Set();
        const parentStatsCache = new WeakMap();

        const activeTitleNorm = normalizeMsgText(getActiveThreadTitle());

        function getParentCounts(p) {
            if (parentStatsCache.has(p)) return parentStatsCache.get(p);
            const autos = p.querySelectorAll('[dir="auto"]');
            let leafAutoCount = 0;
            for (let k = 0; k < autos.length; k++) {
                const aNode = autos[k];
                if (aNode.closest('[data-n0-ui]')) continue;
                if (aNode.closest('h4, h5, button, [role="button"], [role="tooltip"], [role="menu"]')) continue;
                if (!aNode.querySelector('[dir="auto"]')) {
                    const t = normalizeMsgText(aNode.textContent || '');
                    if (!t || isSystemOrTimestampText(t)) continue;
                    if (
                        activeTitleNorm &&
                        activeTitleNorm !== 'Đoạn chat' &&
                        (t === activeTitleNorm ||
                            (t.length >= 2 && t.length <= 40 && activeTitleNorm.toLowerCase().indexOf(t.toLowerCase()) !== -1))
                    ) {
                        continue;
                    }
                    leafAutoCount++;
                }
            }
            let largeVisualCount = 0;
            if (p.getAttribute('role') !== 'row') {
                const visuals = p.querySelectorAll('img, video');
                for (let k = 0; k < visuals.length; k++) {
                    const vm = visuals[k];
                    if (vm.closest('[data-n0-ui]')) continue;
                    if (vm.tagName === 'VIDEO') {
                        largeVisualCount++;
                    } else if (!isLikelyAvatarImage(vm)) {
                        const dims = getImgDimensions(vm);
                        if (dims.w > 56 || dims.h > 56) largeVisualCount++;
                    }
                }
            }
            const stats = { leafAutoCount: leafAutoCount, largeVisualCount: largeVisualCount };
            parentStatsCache.set(p, stats);
            return stats;
        }

        for (let i = 0; i < seeds.length; i++) {
            const el = seeds[i];
            const tag = el.tagName;
            const isAuto = el.getAttribute('dir') === 'auto';

            if ((tag === 'SPAN' || tag === 'I' || tag === 'EM') && !isAuto) {
                if (el.querySelector('span, i, em, div')) continue;
                const raw = normalizeMsgText(el.textContent || '');
                if (raw.length < 6 || raw.length > 180 || !UNSENT_TOMBSTONE_RE.test(raw)) continue;
                if (el.closest('[dir="auto"]')) continue;
            } else if (isAuto) {
                const raw = normalizeMsgText(el.textContent || '');
                if (!raw) continue;
                if (!UNSENT_TOMBSTONE_RE.test(raw) && isSystemOrTimestampText(raw)) continue;
                if (el.querySelector('[dir="auto"]')) continue;
            } else if (tag === 'IMG') {
                const src = el.currentSrc || el.src || '';
                if (!src || src.startsWith('data:image/svg')) continue;
                if (isLikelyAvatarImage(el)) continue;
            } else if (tag === 'A') {
                const rawHref = el.getAttribute('href') || el.href || '';
                if (!unwrapMessageLinkUrl(rawHref)) continue;
            } else if (tag !== 'VIDEO') {
                continue;
            }

            if (el.closest('[data-n0-ui]')) continue;
            if (el.closest('[role="textbox"], [contenteditable="true"], h1, h2, h3, [role="heading"], [role="tooltip"], [role="menu"]')) continue;
            if (el.closest('[aria-label*="Thông tin"], [aria-label*="Chat info"]')) continue;
            if (
                (isAuto || tag === 'SPAN') &&
                el.closest('button, [role="button"]') &&
                !el.closest('a[href]') &&
                !UNSENT_TOMBSTONE_RE.test(normalizeMsgText(el.textContent || ''))
            ) {
                continue;
            }

            const rect = el.getBoundingClientRect();
            if (rect.width <= 0 || rect.height <= 0) continue;
            if ((isAuto || tag === 'SPAN' || tag === 'I' || tag === 'EM') && rect.width <= 4 && rect.height <= 4) continue;
            if (tag === 'IMG') {
                const dims = getImgDimensions(el);
                if (dims.w <= 56 && dims.h <= 56) continue;
            } else if (tag === 'VIDEO') {
                const vw = el.videoWidth || el.width || rect.width || 0;
                const vh = el.videoHeight || el.height || rect.height || 0;
                if (vw <= 40 && vh <= 40) continue;
            }
            if (rect.bottom <= chatTop || rect.top >= chatBottom) continue;
            if (rect.right <= chatLeft || rect.left >= chatRight) continue;

            let rowBox = el;
            const nativeRow = typeof el.closest === 'function' ? el.closest('[role="row"]') : null;
            if (nativeRow && nativeRow !== main && (!main.contains || main.contains(nativeRow))) {
                const nRect = nativeRow.getBoundingClientRect();
                if (nativeRow.querySelectorAll('[role="row"]').length === 0 && nRect.height <= 900) {
                    rowBox = nativeRow;
                }
            }
            if (rowBox === el) {
                for (let step = 0; step < 6; step++) {
                    const p = rowBox.parentElement;
                    if (!p || p === main || p.getAttribute('role') === 'grid' || p.getAttribute('role') === 'log') break;
                    if (p.querySelectorAll('[role="row"]').length > 1) break;
                    const pRect = p.getBoundingClientRect();
                    if (pRect.height > 780 || pRect.top < chatTop - 40) break;

                    const insideAnchor = typeof rowBox.closest === 'function' && !!rowBox.closest('a[href]');
                    const counts = getParentCounts(p);
                    if (!insideAnchor && counts.leafAutoCount > 1) break;
                    if (p.getAttribute('role') !== 'row' && counts.largeVisualCount > 1) break;

                    rowBox = p;
                    if (rowBox.getAttribute('role') === 'row') break;
                }
            }

            if (!seenRows.has(rowBox)) {
                seenRows.add(rowBox);
                msgRows.push(rowBox);
            }
        }

        // Loại bỏ trường hợp row cha bọc row con trong cùng danh sách để tránh nhân đôi
        const dedupedRows = [];
        for (let i = 0; i < msgRows.length; i++) {
            const candidate = msgRows[i];
            let hasInnerRow = false;
            if (candidate.getAttribute('role') !== 'row' && typeof candidate.contains === 'function') {
                for (let j = 0; j < msgRows.length; j++) {
                    if (i !== j && candidate.contains(msgRows[j])) {
                        hasInnerRow = true;
                        break;
                    }
                }
            }
            if (!hasInnerRow) dedupedRows.push(candidate);
        }

        dedupedRows.sort(function (a, b) {
            return a.getBoundingClientRect().top - b.getBoundingClientRect().top;
        });

        return {
            rows: dedupedRows,
            containerRect: { left: chatLeft, right: chatRight, width: Math.max(100, chatRight - chatLeft) },
        };
    }

    function upsertLedgerEntry(tStore, entry) {
        if (!tStore || !entry || !isValidCapturedContent(entry.text, entry.media)) return;
        const sig = buildMessageKey(entry);
        if (entry.msgId && tStore.byMsgId[entry.msgId]) {
            const existing = tStore.byMsgId[entry.msgId];
            if (entry.text) existing.text = entry.text;
            if (Array.isArray(entry.media) && entry.media.length > 0) existing.media = entry.media;
            if (entry.prevSig) existing.prevSig = entry.prevSig;
            if (entry.nextSig) existing.nextSig = entry.nextSig;
            existing.updatedAt = Date.now();
            return;
        }
        const tailStart = Math.max(0, tStore.entries.length - 20);
        for (let i = tStore.entries.length - 1; i >= tailStart; i--) {
            const e = tStore.entries[i];
            if (
                e &&
                buildMessageKey(e) === sig &&
                ((entry.prevSig && e.prevSig === entry.prevSig) || (entry.nextSig && e.nextSig === entry.nextSig) || (!entry.prevSig && !entry.nextSig))
            ) {
                if (Array.isArray(entry.media) && entry.media.length > 0) e.media = entry.media;
                if (entry.msgId && !e.msgId) {
                    e.msgId = entry.msgId;
                    tStore.byMsgId[entry.msgId] = e;
                }
                e.updatedAt = Date.now();
                return;
            }
        }
        const stored = {
            id: entry.id || 'en_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
            msgId: entry.msgId || '',
            sig: sig,
            sender: entry.sender,
            text: entry.text,
            media: entry.media,
            alignRight: !!entry.alignRight,
            prevSig: entry.prevSig || '',
            nextSig: entry.nextSig || '',
            timeLabel: entry.timeLabel,
            updatedAt: Date.now(),
        };
        tStore.entries.push(stored);
        if (tStore.entries.length > 120) tStore.entries = tStore.entries.slice(-120);
        if (stored.msgId) tStore.byMsgId[stored.msgId] = stored;
        ledgerDirty = true;
    }

    function harvestRemovedSubtree(node, mainPanel) {
        if (!antiRecallEnabled || !node || node.nodeType !== 1) return;
        if (node.closest && node.closest('[data-n0-ui], [role="textbox"], [contenteditable="true"]')) return;
        if (node.getAttribute && node.getAttribute('data-n0-ui')) return;

        const threadKey = getCurrentThreadKey();
        if (!threadKey || threadKey === '/' || threadKey === 'default') return;
        if (lastObservedThreadKey && threadKey !== lastObservedThreadKey) return;
        const tStore = ensureThreadStore(threadKey, getActiveThreadTitle());
        const now = Date.now();

        let snap = null;
        if (rowSnapshotMap.has(node)) {
            snap = rowSnapshotMap.get(node);
        } else {
            if (node.querySelectorAll('[role="row"]').length > 1 || node.querySelectorAll('[dir="auto"]').length > 6) {
                return;
            }
            const mainRect = mainPanel && typeof mainPanel.getBoundingClientRect === 'function'
                ? mainPanel.getBoundingClientRect()
                : { left: 240, right: 1100, width: 860 };
            const p = extractMessagePayload(node, mainRect, { detached: true });
            if (!p.isTombstone && !p.isSystemOrTime && isValidCapturedContent(p.text, p.media)) {
                snap = {
                    sender: p.sender,
                    text: p.text,
                    media: p.media,
                    alignRight: p.alignRight,
                    msgId: p.msgId,
                    fiberKey: p.msgId,
                    prevSig: '',
                    nextSig: '',
                    timeLabel: p.timeLabel,
                };
            }
        }

        if (!snap || !isValidCapturedContent(snap.text, snap.media)) return;
        upsertLedgerEntry(tStore, snap);

        detachedQueue.push({
            threadKey: threadKey,
            record: snap,
            removedAt: now,
        });
        if (detachedQueue.length > 30) detachedQueue = detachedQueue.slice(-30);
    }

    function scanAntiRecall() {
        if (!antiRecallEnabled) return;
        const root = document.documentElement;
        if (!root || root.getAttribute('data-n0-page') !== 'app') return;

        const navLinksCount = scanSidebarPreviews();

        const main = getActiveMainPanel();
        if (!main) return;

        const threadKey = getCurrentThreadKey();
        const threadTitle = getActiveThreadTitle();
        const tStore = ensureThreadStore(threadKey, threadTitle);

        const found = discoverChatRows(main);
        const rows = found.rows;
        if (!rows || rows.length === 0) {
            emitAntiRecallDiag(navLinksCount, 0, 0, tStore.stableViewport.length, recalledLog.length);
            return;
        }

        const mainRect = found.containerRect || main.getBoundingClientRect();
        const payloads = [];
        let tombstoneCount = 0;
        for (let i = 0; i < rows.length; i++) {
            const p = extractMessagePayload(rows[i], mainRect);
            if (p.isTombstone) tombstoneCount++;
            payloads.push(p);
        }

        function findPrevAnchor(rowIndex) {
            for (let p = rowIndex - 1; p >= 0; p--) {
                const cand = payloads[p];
                if (cand.isTombstone) return '';
                if (!cand.isSystemOrTime && isValidCapturedContent(cand.text, cand.media)) {
                    return buildMessageKey(cand);
                }
            }
            return '';
        }

        function findNextAnchor(rowIndex) {
            for (let n = rowIndex + 1; n < payloads.length; n++) {
                const cand = payloads[n];
                if (cand.isTombstone) return '';
                if (!cand.isSystemOrTime && isValidCapturedContent(cand.text, cand.media)) {
                    return buildMessageKey(cand);
                }
            }
            return '';
        }

        const currMsgList = [];
        const currKeys = new Set();
        const currKeyCounts = Object.create(null);
        const currMsgIds = new Set();
        const nextViewport = [];
        const digestParts = [];

        // Bước Ingest: ghi nhận toàn bộ tin nhắn đang hiển thị vào sổ cái trước
        for (let i = 0; i < payloads.length; i++) {
            const p = payloads[i];
            if (p.isTombstone || p.isSystemOrTime || !isValidCapturedContent(p.text, p.media)) continue;

            const prevSig = findPrevAnchor(i);
            const nextSig = findNextAnchor(i);
            const snap = {
                sender: p.sender,
                text: p.text,
                media: p.media,
                alignRight: p.alignRight,
                msgId: p.msgId || '',
                fiberKey: p.msgId || '',
                prevSig: prevSig,
                nextSig: nextSig,
                anchorPrevText: prevSig,
                timeLabel: p.timeLabel,
            };

            const k = buildMessageKey(snap);
            currMsgList.push({ idx: i, info: p, snap: snap, key: k });
            currKeys.add(k);
            currKeyCounts[k] = (currKeyCounts[k] || 0) + 1;
            if (snap.msgId) currMsgIds.add(snap.msgId);

            rowSnapshotMap.set(rows[i], snap);
            upsertLedgerEntry(tStore, snap);
            nextViewport.push(snap);
            digestParts.push(k);
        }

        // Lọc detachedQueue (> 8s) & protocolVault.recalledQueue (> 15s) để ghép ứng viên vừa biến mất
        const now = Date.now();
        detachedQueue = detachedQueue.filter(function (d) {
            return d && now - d.removedAt < 8000;
        });
        protocolVault.recalledQueue = protocolVault.recalledQueue.filter(function (q) {
            return q && now - q.recalledAt < 15000;
        });

        const remainingCounts = Object.assign(Object.create(null), currKeyCounts);
        const disappeared = [];
        const disappearedDedup = new Set();

        for (let i = 0; i < tStore.stableViewport.length; i++) {
            const prevItem = tStore.stableViewport[i];
            const k = buildMessageKey(prevItem);
            if (remainingCounts[k] > 0) {
                remainingCounts[k]--;
            } else if (isValidCapturedContent(prevItem.text, prevItem.media)) {
                disappeared.push(prevItem);
                disappearedDedup.add(prevItem.msgId ? 'id:' + prevItem.msgId : k + '|' + (prevItem.prevSig || ''));
            }
        }

        for (let i = detachedQueue.length - 1; i >= 0; i--) {
            const dItem = detachedQueue[i];
            if (!dItem || dItem.threadKey !== threadKey) continue;
            const rec = dItem.record;
            const k = buildMessageKey(rec);
            if (currKeys.has(k) || (rec.msgId && currMsgIds.has(rec.msgId))) continue;
            const dedupId = rec.msgId ? 'id:' + rec.msgId : k + '|' + (rec.prevSig || '');
            if (!disappearedDedup.has(dedupId)) {
                disappearedDedup.add(dedupId);
                disappeared.push(rec);
            }
        }

        for (let i = protocolVault.recalledQueue.length - 1; i >= 0; i--) {
            const qItem = protocolVault.recalledQueue[i];
            if (!qItem || !qItem.record) continue;
            if (qItem.threadKey && qItem.threadKey !== threadKey) continue;
            const rec = qItem.record;
            const k = buildMessageKey(rec);
            if (currKeys.has(k) || (rec.msgId && currMsgIds.has(rec.msgId))) continue;
            const dedupId = rec.msgId ? 'id:' + rec.msgId : k;
            if (!disappearedDedup.has(dedupId)) {
                disappearedDedup.add(dedupId);
                disappeared.push(rec);
            }
        }

        const usedRecordIds = new Set();
        const unboundRef = collectBoundRecordIdsAndKeys(threadKey);
        unboundRef.boundIds.forEach(function (id) {
            usedRecordIds.add(id);
        });

        // Lượt 1 Bước Khôi Phục: thu thập các bản ghi đã gắn ở lượt trước
        for (let i = 0; i < rows.length; i++) {
            if (!payloads[i].isTombstone) continue;
            const row = rows[i];
            if (rowResolvedMap.has(row)) {
                const existing = rowResolvedMap.get(row);
                if (existing && existing.id) usedRecordIds.add(existing.id);
                const existingUi = row.querySelector('[data-n0-ui="anti-recall"]');
                if (!existingUi) {
                    renderRestoredBubbleInRow(row, existing);
                }
            }
        }

        function consumeDisappearedMatch(pred) {
            for (let d = 0; d < disappeared.length; d++) {
                if (pred(disappeared[d])) {
                    return disappeared.splice(d, 1)[0];
                }
            }
            return null;
        }

        function recoverForTombstone(row, info, prevSig, nextSig) {
            let recovered = null;

            // Tầng 2: Chính DOM node đó đã được snapshot trước khi thu hồi
            if (rowSnapshotMap.has(row)) {
                const cand = rowSnapshotMap.get(row);
                if (cand && isValidCapturedContent(cand.text, cand.media)) recovered = cand;
            }

            // Tầng 2.5: Kho lưu trữ tầng giao thức (WebSocket / IndexedDB / Worker / WebRTC / Fetch)
            if (!recovered && info.msgId) {
                const pCand = protocolVault.recalledById[info.msgId] || protocolVault.byMsgId[info.msgId] || null;
                if (pCand && (!pCand.id || !usedRecordIds.has(pCand.id)) && isValidCapturedContent(pCand.text, pCand.media)) {
                    recovered = pCand;
                }
            }

            // Tầng 3: Khớp tuyệt đối qua msgId trong React Fiber hoặc log đã lưu
            if (!recovered && info.msgId) {
                let byId = tStore.recalledById[info.msgId] || tStore.byMsgId[info.msgId] || null;
                if (!byId) {
                    for (let l = 0; l < recalledLog.length; l++) {
                        const rl = recalledLog[l];
                        if (rl && rl.msgId === info.msgId && (!rl.threadKey || rl.threadKey === threadKey)) {
                            byId = rl;
                            break;
                        }
                    }
                }
                if (byId && (!byId.id || !usedRecordIds.has(byId.id)) && isValidCapturedContent(byId.text, byId.media)) {
                    recovered = byId;
                }
            }

            // Tầng 4: Khớp từ danh sách vừa biến mất (chỉ áp dụng cho tombstone mới, không ép gắn lên tombstone cũ lúc cuộn trang)
            if (!recovered && !knownUnmatchedTombstoneSet.has(row) && disappeared.length > 0) {
                if (prevSig && nextSig) {
                    recovered = consumeDisappearedMatch(function (x) {
                        return (x.prevSig === prevSig || x.anchorPrevText === prevSig) && x.nextSig === nextSig;
                    });
                }
                if (!recovered && prevSig) {
                    recovered = consumeDisappearedMatch(function (x) {
                        return (x.prevSig === prevSig || x.anchorPrevText === prevSig) && x.alignRight === info.alignRight;
                    });
                }
                if (!recovered && nextSig) {
                    recovered = consumeDisappearedMatch(function (x) {
                        return x.nextSig === nextSig && x.alignRight === info.alignRight;
                    });
                }
                if (!recovered && (prevSig || nextSig)) {
                    recovered = consumeDisappearedMatch(function (x) {
                        return (
                            (prevSig && (x.prevSig === prevSig || x.anchorPrevText === prevSig)) ||
                            (nextSig && x.nextSig === nextSig)
                        );
                    });
                }
                if (!recovered) {
                    recovered = consumeDisappearedMatch(function (x) {
                        return x.alignRight === info.alignRight;
                    });
                }
                if (!recovered) {
                    recovered = disappeared.shift();
                }
            }

            // Tầng 5: Khớp theo ngữ cảnh kề (prevSig / nextSig) từ sổ cái hoặc log của thread
            if (!recovered && (prevSig || nextSig)) {
                const pool = [];
                for (let r = tStore.recalledRecords.length - 1; r >= 0; r--) pool.push(tStore.recalledRecords[r]);
                for (let l = 0; l < recalledLog.length; l++) {
                    if (recalledLog[l] && recalledLog[l].threadKey === threadKey) pool.push(recalledLog[l]);
                }
                for (let e = tStore.entries.length - 1; e >= 0; e--) {
                    const ent = tStore.entries[e];
                    if (ent && !currKeys.has(buildMessageKey(ent))) pool.push(ent);
                }

                for (let pIdx = 0; pIdx < pool.length; pIdx++) {
                    const rr = pool[pIdx];
                    if (!rr || (rr.id && usedRecordIds.has(rr.id))) continue;
                    if (!isValidCapturedContent(rr.text, rr.media)) continue;
                    const matchPrev = prevSig && (rr.prevSig === prevSig || rr.anchorPrevText === prevSig);
                    const matchNext = nextSig && rr.nextSig === nextSig;
                    if (matchPrev || matchNext) {
                        recovered = rr;
                        break;
                    }
                }
            }

            // Tầng 6: Dự phòng từ sidebar preview khi đoạn chat ở nền
            if (!recovered && sidebarPendingRecallByThread[threadKey]) {
                const sb = sidebarPendingRecallByThread[threadKey];
                delete sidebarPendingRecallByThread[threadKey];
                if (sb && isValidCapturedContent(sb.text, sb.media)) {
                    recovered = sb;
                }
            }

            return recovered;
        }

        // Lượt 2 Bước Khôi Phục: giải quyết các dòng tombstone mới
        const unmatchedTombstones = [];
        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const info = payloads[i];
            if (!info.isTombstone || rowResolvedMap.has(row)) continue;

            const prevSig = findPrevAnchor(i);
            const nextSig = findNextAnchor(i);
            const recovered = recoverForTombstone(row, info, prevSig, nextSig);

            if (recovered) {
                if (!recovered.id) {
                    recovered.id = 'rr_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
                }
                usedRecordIds.add(recovered.id);
                if (!recovered.prevSig && prevSig) recovered.prevSig = prevSig;
                if (!recovered.nextSig && nextSig) recovered.nextSig = nextSig;

                const bindMsgId = info.msgId || recovered.msgId;
                if (bindMsgId) {
                    recovered.msgId = bindMsgId;
                    tStore.recalledById[bindMsgId] = recovered;
                    ledgerDirty = true;
                }

                const alreadyInThreadRecalls = tStore.recalledRecords.some(function (x) {
                    return x && x.id === recovered.id;
                });
                if (!alreadyInThreadRecalls) {
                    tStore.recalledRecords.push(recovered);
                    if (tStore.recalledRecords.length > 60) {
                        tStore.recalledRecords = tStore.recalledRecords.slice(-60);
                    }
                    ledgerDirty = true;
                }

                // Loại khỏi detachedQueue & protocolVault.recalledQueue nếu vừa khớp
                detachedQueue = detachedQueue.filter(function (d) {
                    return d && buildMessageKey(d.record) !== buildMessageKey(recovered);
                });
                protocolVault.recalledQueue = protocolVault.recalledQueue.filter(function (q) {
                    return q && q.msgId !== bindMsgId && buildMessageKey(q.record) !== buildMessageKey(recovered);
                });

                rowResolvedMap.set(row, recovered);
                renderRestoredBubbleInRow(row, recovered);
                recordRecalledMessage({
                    id: recovered.id,
                    threadKey: threadKey,
                    threadTitle: threadTitle,
                    sender: recovered.sender,
                    text: recovered.text,
                    media: recovered.media,
                    alignRight: recovered.alignRight,
                    msgId: bindMsgId,
                    prevSig: recovered.prevSig || prevSig,
                    nextSig: recovered.nextSig || nextSig,
                    timeLabel: recovered.timeLabel,
                    source: 'thread',
                });
            } else {
                knownUnmatchedTombstoneSet.add(row);
                unmatchedTombstones.push({
                    row: row,
                    prevSig: prevSig,
                    nextSig: nextSig,
                    alignRight: info.alignRight,
                });
            }
        }

        if (unmatchedTombstones.length > 0) {
            const unboundCandidates = collectUnboundCandidatesForThread(threadKey).filter(function (c) {
                return !c.id || !usedRecordIds.has(c.id);
            });
            for (let u = 0; u < unmatchedTombstones.length; u++) {
                const um = unmatchedTombstones[u];
                renderUnmatchedTombstoneUi(
                    um.row,
                    threadKey,
                    um.prevSig,
                    um.nextSig,
                    um.alignRight,
                    unboundCandidates.length
                );
            }
        }

        // Bước Bảo Vệ Partial-Render: không để nhịp render dở dang (vd: 8 -> 3) xóa mất stableViewport
        const prevStableCount = tStore.stableViewport.length;
        const currLiveCount = nextViewport.length;
        const isPartialRenderDrop =
            tombstoneCount === 0 &&
            prevStableCount >= 4 &&
            currLiveCount > 0 &&
            currLiveCount <= Math.floor(prevStableCount * 0.5) &&
            now - (tStore.stableUpdatedAt || 0) < 4000;

        if (!isPartialRenderDrop) {
            tStore.stableViewport = nextViewport.slice(-80);
            tStore.stableUpdatedAt = now;
        } else if (nextViewport.length > 0) {
            const existingKeys = new Set(tStore.stableViewport.map(buildMessageKey));
            for (let i = 0; i < nextViewport.length; i++) {
                const k = buildMessageKey(nextViewport[i]);
                if (!existingKeys.has(k)) {
                    tStore.stableViewport.push(nextViewport[i]);
                    existingKeys.add(k);
                }
            }
        }

        const nextDigest = digestParts.slice(-80).join('\n');
        if (nextDigest !== tStore._lastDigest) {
            tStore._lastDigest = nextDigest;
            ledgerDirty = true;
        }
        if (threadKey && threadKey !== '/' && threadKey !== 'default') {
            lastObservedThreadKey = threadKey;
        }
        scheduleSaveAntiRecall(false);
        emitAntiRecallDiag(navLinksCount, rows.length, tombstoneCount, tStore.stableViewport.length, recalledLog.length);
    }

    // ================= MENU & THANH ĐIỀU CHỈNH CHỨC NĂNG =================
    const FEATURE_SWITCHES = [
        {
            key: 'anti_recall',
            stateKey: 'antiRecall',
            label: 'Chống thu hồi',
            desc: 'Giữ lại tin nhắn, ảnh, video và link bị gỡ',
        },
        {
            key: 'block_seen',
            stateKey: 'blockSeen',
            label: 'Chống xem',
            desc: 'Không gửi trạng thái Đã xem',
        },
        {
            key: 'block_typing',
            stateKey: 'blockTyping',
            label: 'Ẩn đang nhập',
            desc: 'Không hiện tín hiệu đang gõ phím',
        },
        {
            key: 'private_mode',
            stateKey: 'privateMode',
            label: 'Làm mờ riêng tư',
            desc: 'Làm mờ đoạn chat khi dời chuột',
        },
        {
            key: 'sidebar_hidden',
            stateKey: 'sidebarHidden',
            label: 'Ẩn danh sách chat',
            desc: 'Thu gọn cột hội thoại bên trái',
        },
        {
            key: 'always_on_top',
            stateKey: 'alwaysOnTop',
            label: 'Ghim trên cùng',
            desc: 'Giữ cửa sổ luôn nổi trên màn hình',
        },
        {
            key: 'background_on_close',
            stateKey: 'backgroundOnClose',
            label: 'Chạy ngầm khi đóng',
            desc: 'Thu xuống khay hệ thống khi bấm X',
        },
    ];

    function setFeatureSetting(key, value) {
        if (key === 'theme') {
            const mode = value === 'light' ? 'light' : 'dark';
            applyTheme(mode, true);
            persistFeatureStateToLocalStorage();
            syncControlMenuUi();
            sendHost('UpdateFeatureSetting', { key: 'theme', str_value: mode });
            return;
        }
        if (key === 'zoom_factor') {
            const num = Math.max(0.7, Math.min(1.6, Math.round(Number(value) * 100) / 100));
            if (!isFinite(num)) return;
            featureState.zoomFactor = num;
            applyFeatureEffectsToDom();
            persistFeatureStateToLocalStorage();
            syncControlMenuUi();
            sendHost('UpdateFeatureSetting', { key: 'zoom_factor', num_value: num });
            return;
        }

        const boolVal = !!value;
        switch (key) {
            case 'anti_recall':
                featureState.antiRecall = boolVal;
                break;
            case 'block_seen':
                featureState.blockSeen = boolVal;
                break;
            case 'block_typing':
                featureState.blockTyping = boolVal;
                break;
            case 'private_mode':
                featureState.privateMode = boolVal;
                break;
            case 'sidebar_hidden':
                featureState.sidebarHidden = boolVal;
                break;
            case 'always_on_top':
                featureState.alwaysOnTop = boolVal;
                break;
            case 'background_on_close':
                featureState.backgroundOnClose = boolVal;
                break;
            default:
                return;
        }

        persistFeatureStateToLocalStorage();
        applyFeatureEffectsToDom();
        syncControlMenuUi();
        sendHost('UpdateFeatureSetting', { key: key, enabled: boolVal });
        if (key === 'anti_recall' && boolVal && typeof scanAntiRecall === 'function') {
            scanAntiRecall();
        }
    }

    function createSlidersIcon() {
        const svg = document.createElementNS(SVG_NS, 'svg');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('width', '16');
        svg.setAttribute('height', '16');
        svg.setAttribute('fill', 'none');
        svg.setAttribute('stroke', 'currentColor');
        svg.setAttribute('stroke-width', '2');
        svg.setAttribute('stroke-linecap', 'round');
        svg.setAttribute('stroke-linejoin', 'round');
        svg.setAttribute('aria-hidden', 'true');

        const segs = [
            ['4', '21', '4', '14'],
            ['4', '10', '4', '3'],
            ['12', '21', '12', '12'],
            ['12', '8', '12', '3'],
            ['20', '21', '20', '16'],
            ['20', '12', '20', '3'],
            ['1', '14', '7', '14'],
            ['9', '8', '15', '8'],
            ['17', '16', '23', '16'],
        ];
        for (let i = 0; i < segs.length; i++) {
            const line = document.createElementNS(SVG_NS, 'line');
            line.setAttribute('x1', segs[i][0]);
            line.setAttribute('y1', segs[i][1]);
            line.setAttribute('x2', segs[i][2]);
            line.setAttribute('y2', segs[i][3]);
            svg.appendChild(line);
        }
        return svg;
    }

    function syncControlMenuUi() {
        const panel = document.getElementById('n0trxxan-control-panel');
        if (!panel) return;

        const themeBtns = panel.querySelectorAll('[data-theme-opt]');
        for (let i = 0; i < themeBtns.length; i++) {
            const opt = themeBtns[i].getAttribute('data-theme-opt');
            const active = opt === featureState.theme;
            themeBtns[i].setAttribute('aria-pressed', active ? 'true' : 'false');
            if (active) themeBtns[i].classList.add('n0-active');
            else themeBtns[i].classList.remove('n0-active');
        }

        const zoomResetBtn = document.getElementById('n0-zoom-reset');
        if (zoomResetBtn) {
            zoomResetBtn.textContent = Math.round((featureState.zoomFactor || 1.0) * 100) + '%';
        }

        const switches = panel.querySelectorAll('[data-feature-key]');
        for (let i = 0; i < switches.length; i++) {
            const sw = switches[i];
            const k = sw.getAttribute('data-feature-key');
            let isOn = false;
            for (let j = 0; j < FEATURE_SWITCHES.length; j++) {
                if (FEATURE_SWITCHES[j].key === k) {
                    isOn = !!featureState[FEATURE_SWITCHES[j].stateKey];
                    break;
                }
            }
            sw.setAttribute('aria-checked', isOn ? 'true' : 'false');
        }
        updatePrivacyStatsUi();
    }

    function toggleControlMenu(forceOpen) {
        ensureControlMenuUi();
        const panel = document.getElementById('n0trxxan-control-panel');
        const btn = document.getElementById('n0trxxan-menu-btn');
        if (!panel || !btn) return;

        const nextOpen = typeof forceOpen === 'boolean' ? forceOpen : !panel.classList.contains('n0-open');
        if (nextOpen) {
            syncControlMenuUi();
            panel.classList.add('n0-open');
            panel.setAttribute('aria-hidden', 'false');
            btn.setAttribute('aria-expanded', 'true');
            const closeBtn = document.getElementById('n0trxxan-menu-close');
            if (closeBtn && typeof closeBtn.focus === 'function') {
                closeBtn.focus();
            }
        } else {
            panel.classList.remove('n0-open');
            panel.setAttribute('aria-hidden', 'true');
            btn.setAttribute('aria-expanded', 'false');
        }
    }

    function ensureControlMenuUi() {
        const hostRoot = document.body || document.documentElement;
        if (!hostRoot) return;
        if (document.getElementById('n0trxxan-menu-root')) {
            syncControlMenuUi();
            return;
        }

        const menuRoot = document.createElement('div');
        menuRoot.id = 'n0trxxan-menu-root';
        menuRoot.setAttribute('data-n0-ui', 'control-menu');

        const menuBtn = document.createElement('button');
        menuBtn.id = 'n0trxxan-menu-btn';
        menuBtn.type = 'button';
        menuBtn.setAttribute('aria-label', 'Menu điều chỉnh chức năng');
        menuBtn.setAttribute('aria-haspopup', 'dialog');
        menuBtn.setAttribute('aria-expanded', 'false');
        menuBtn.title = 'Menu điều chỉnh chức năng (dev by n0trxxan.1112) - Alt+M';
        menuBtn.appendChild(createSlidersIcon());
        menuBtn.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            toggleControlMenu();
        });

        const panel = document.createElement('div');
        panel.id = 'n0trxxan-control-panel';
        panel.setAttribute('role', 'dialog');
        panel.setAttribute('aria-modal', 'false');
        panel.setAttribute('aria-hidden', 'true');
        panel.setAttribute('aria-label', 'Thanh điều chỉnh chức năng');

        const header = document.createElement('div');
        header.className = 'n0-ctrl-header';
        const title = document.createElement('span');
        title.className = 'n0-ctrl-title';
        title.innerHTML = '<span class="n0-ctrl-title-icon">✦</span> <span class="n0-ctrl-title-text">Holo Menu</span> <span class="n0-holo-badge">dev by n0trxxan.1112</span>';
        const closeBtn = document.createElement('button');
        closeBtn.id = 'n0trxxan-menu-close';
        closeBtn.type = 'button';
        closeBtn.className = 'n0-ctrl-close';
        closeBtn.setAttribute('aria-label', 'Đóng bảng điều chỉnh');
        closeBtn.textContent = '✕';
        closeBtn.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            toggleControlMenu(false);
        });
        header.appendChild(title);
        header.appendChild(closeBtn);
        panel.appendChild(header);

        const quickBar = document.createElement('div');
        quickBar.className = 'n0-ctrl-bar';

        const themeGroup = document.createElement('div');
        themeGroup.className = 'n0-ctrl-seg';
        themeGroup.setAttribute('role', 'group');
        themeGroup.setAttribute('aria-label', 'Giao diện');

        const lightBtn = document.createElement('button');
        lightBtn.type = 'button';
        lightBtn.className = 'n0-seg-btn';
        lightBtn.setAttribute('data-theme-opt', 'light');
        lightBtn.textContent = 'Sáng';
        lightBtn.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            setFeatureSetting('theme', 'light');
        });

        const darkBtn = document.createElement('button');
        darkBtn.type = 'button';
        darkBtn.className = 'n0-seg-btn';
        darkBtn.setAttribute('data-theme-opt', 'dark');
        darkBtn.textContent = 'Tối';
        darkBtn.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            setFeatureSetting('theme', 'dark');
        });
        themeGroup.appendChild(lightBtn);
        themeGroup.appendChild(darkBtn);

        const zoomGroup = document.createElement('div');
        zoomGroup.className = 'n0-ctrl-zoom';
        zoomGroup.setAttribute('role', 'group');
        zoomGroup.setAttribute('aria-label', 'Thu phóng');

        const zoomDec = document.createElement('button');
        zoomDec.id = 'n0-zoom-dec';
        zoomDec.type = 'button';
        zoomDec.className = 'n0-zoom-btn';
        zoomDec.setAttribute('aria-label', 'Thu nhỏ');
        zoomDec.textContent = '−';
        zoomDec.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            setFeatureSetting('zoom_factor', (featureState.zoomFactor || 1.0) - 0.1);
        });

        const zoomReset = document.createElement('button');
        zoomReset.id = 'n0-zoom-reset';
        zoomReset.type = 'button';
        zoomReset.className = 'n0-zoom-reset';
        zoomReset.title = 'Đặt lại 100%';
        zoomReset.textContent = '100%';
        zoomReset.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            setFeatureSetting('zoom_factor', 1.0);
        });

        const zoomInc = document.createElement('button');
        zoomInc.id = 'n0-zoom-inc';
        zoomInc.type = 'button';
        zoomInc.className = 'n0-zoom-btn';
        zoomInc.setAttribute('aria-label', 'Phóng to');
        zoomInc.textContent = '+';
        zoomInc.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            setFeatureSetting('zoom_factor', (featureState.zoomFactor || 1.0) + 0.1);
        });

        zoomGroup.appendChild(zoomDec);
        zoomGroup.appendChild(zoomReset);
        zoomGroup.appendChild(zoomInc);

        quickBar.appendChild(themeGroup);
        quickBar.appendChild(zoomGroup);
        panel.appendChild(quickBar);

        const list = document.createElement('div');
        list.className = 'n0-ctrl-list';
        for (let i = 0; i < FEATURE_SWITCHES.length; i++) {
            const item = FEATURE_SWITCHES[i];
            const rowBtn = document.createElement('button');
            rowBtn.type = 'button';
            rowBtn.className = 'n0-ctrl-switch';
            rowBtn.setAttribute('role', 'switch');
            rowBtn.setAttribute('data-feature-key', item.key);
            rowBtn.setAttribute('aria-checked', featureState[item.stateKey] ? 'true' : 'false');

            const textCol = document.createElement('span');
            textCol.className = 'n0-ctrl-text';
            const lbl = document.createElement('span');
            lbl.className = 'n0-ctrl-label';
            lbl.textContent = item.label;
            const sub = document.createElement('span');
            sub.className = 'n0-ctrl-desc';
            sub.textContent = item.desc;
            textCol.appendChild(lbl);
            textCol.appendChild(sub);

            const track = document.createElement('span');
            track.className = 'n0-switch-track';
            track.setAttribute('aria-hidden', 'true');
            const thumb = document.createElement('span');
            thumb.className = 'n0-switch-thumb';
            track.appendChild(thumb);

            rowBtn.appendChild(textCol);
            rowBtn.appendChild(track);
            rowBtn.addEventListener('click', function (e) {
                e.preventDefault();
                e.stopPropagation();
                setFeatureSetting(item.key, !featureState[item.stateKey]);
            });

            list.appendChild(rowBtn);
        }
        panel.appendChild(list);

        const privStats = document.createElement('div');
        privStats.id = 'n0trxxan-priv-stats';
        privStats.className = 'n0-ctrl-stats';
        privStats.setAttribute('aria-live', 'off');
        panel.appendChild(privStats);

        const devFooter = document.createElement('div');
        devFooter.className = 'n0-ctrl-dev-footer';
        devFooter.innerHTML = '<div class="n0-holo-glitch">⚡ DEV BY N0TRXXAN.1112 ⚡</div>';
        panel.appendChild(devFooter);

        menuRoot.appendChild(menuBtn);
        menuRoot.appendChild(panel);
        hostRoot.appendChild(menuRoot);
        syncControlMenuUi();
    }

    function init() {
        loadAntiRecallStorage();
        if (window.__CAPRINE_CUSTOM_LOGO) {
            document.documentElement.style.setProperty('--n0-custom-logo', 'url("' + window.__CAPRINE_CUSTOM_LOGO + '")');
        }
        applyTheme(getSavedTheme(), true);
        applyFeatureEffectsToDom();
        ensureControlMenuUi();
        updatePageContext();
        scanAntiRecall();

        if (window.ipc) {
            try {
                window.ipc.postMessage(JSON.stringify({ type: 'PageReady' }));
            } catch (_) {}
        }

        if (document.body) {
            let mutationDebounceTimer = null;
            let lastImmediateScanTs = 0;
            const observer = new MutationObserver(function (mutations) {
                if (suppressAntiRecallMutations) return;

                let hasMessageMutation = false;
                let hasStructuralMutation = false;
                for (let i = 0; i < mutations.length; i++) {
                    const m = mutations[i];
                    const target = m.target;
                    const elTarget = target && target.nodeType === 1 ? target : target && target.parentElement;
                    if (!elTarget || !elTarget.closest) continue;
                    if (elTarget.closest('[data-n0-ui]')) continue;
                    if (elTarget.closest('[role="textbox"], [contenteditable="true"]')) continue;

                    const mainPanel = elTarget.closest('[role="main"]');
                    if (m.type === 'childList' && m.removedNodes && m.removedNodes.length > 0 && mainPanel) {
                        for (let r = 0; r < m.removedNodes.length; r++) {
                            harvestRemovedSubtree(m.removedNodes[r], mainPanel);
                        }
                    }

                    hasMessageMutation = true;
                    if (m.type === 'childList' && (m.addedNodes.length > 0 || m.removedNodes.length > 0)) {
                        hasStructuralMutation = true;
                    }
                }
                if (!hasMessageMutation) return;

                if (hasStructuralMutation) {
                    const now = Date.now();
                    if (now - lastImmediateScanTs >= 40) {
                        lastImmediateScanTs = now;
                        Promise.resolve().then(function () {
                            updatePageContext();
                            scanAntiRecall();
                        });
                    }
                }

                if (mutationDebounceTimer) return;
                mutationDebounceTimer = setTimeout(function () {
                    mutationDebounceTimer = null;
                    updatePageContext();
                    syncMessengerNativeTheme(getSavedTheme());
                    checkUnreadCount();
                    scanAntiRecall();
                }, 70);
            });
            activeMutationObserver = observer;
            observer.observe(document.body, { childList: true, subtree: true, characterData: true });

            setInterval(function () {
                updatePageContext();
                scanAntiRecall();
            }, 800);
        }
    }

    // Chặn pointerdown/mousedown và xử lý click khôi phục ở capture phase trên window trước React của Messenger
    function swallowPointerForAntiRecall(e) {
        if (!e.target || typeof e.target.closest !== 'function') return;
        const menuEl = e.target.closest('[data-n0-ui="control-menu"]');
        if (menuEl) {
            e.stopPropagation();
            return;
        }
        const actionEl = e.target.closest('[data-n0-ui="anti-recall"] [data-n0-action], video.n0-recalled-video');
        if (actionEl) {
            e.stopPropagation();
        }
    }
    window.addEventListener('pointerdown', swallowPointerForAntiRecall, true);
    window.addEventListener('mousedown', swallowPointerForAntiRecall, true);
    window.addEventListener(
        'click',
        function (e) {
            if (!e.target || typeof e.target.closest !== 'function') return;
            const panel = document.getElementById('n0trxxan-control-panel');
            if (panel && panel.classList.contains('n0-open') && !e.target.closest('#n0trxxan-menu-root')) {
                toggleControlMenu(false);
            }
            const actionEl = e.target.closest('[data-n0-ui="anti-recall"] [data-n0-action]');
            if (!actionEl) return;
            const handler = actionHandlerMap.get(actionEl);
            if (typeof handler === 'function') {
                if (e.__n0Handled) return;
                e.__n0Handled = true;
                e.preventDefault();
                e.stopPropagation();
                handler();
            }
        },
        true
    );

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') {
            const panel = document.getElementById('n0trxxan-control-panel');
            if (panel && panel.classList.contains('n0-open')) {
                e.preventDefault();
                toggleControlMenu(false);
                const btn = document.getElementById('n0trxxan-menu-btn');
                if (btn && typeof btn.focus === 'function') btn.focus();
            }
            return;
        }
        if (e.altKey && (e.key === 'm' || e.key === 'M')) {
            e.preventDefault();
            toggleControlMenu();
            return;
        }
        if (e.altKey && (e.key === 't' || e.key === 'T')) {
            e.preventDefault();
            const current = document.documentElement.getAttribute('data-n0-theme') || getSavedTheme();
            setFeatureSetting('theme', current === 'dark' ? 'light' : 'dark');
        }
    });

    document.addEventListener('click', function (e) {
        if (e.__n0Handled) return;
        if (!e.target || typeof e.target.closest !== 'function') return;
        const anchor = e.target.closest('a');
        if (!anchor || !anchor.href) return;

        const href = anchor.href;
        try {
            const url = new URL(href);
            const host = (url.hostname || '').toLowerCase();
            const p = url.pathname || '';
            const isMessenger = host === 'messenger.com' || host.endsWith('.messenger.com');
            const isWorkplace = host === 'workplace.com' || host.endsWith('.workplace.com');
            const isFacebook = host === 'facebook.com' || host.endsWith('.facebook.com');
            const isFbInternal =
                isFacebook &&
                (p.indexOf('/login') === 0 ||
                    p.indexOf('/checkpoint') === 0 ||
                    p.indexOf('/recover') === 0 ||
                    p.indexOf('/identify') === 0 ||
                    p.indexOf('/two_step_verification') === 0 ||
                    p.indexOf('/dialog') === 0 ||
                    p.indexOf('/messages') === 0 ||
                    p.indexOf('/t/') !== -1 ||
                    p.indexOf('/e2ee/') !== -1 ||
                    p.indexOf('/ajax') === 0);

            if ((!isMessenger && !isWorkplace && !isFbInternal) || p.indexOf('/l.php') !== -1) {
                e.preventDefault();
                e.stopPropagation();
                sendHost('OpenExternal', { url: href });
            }
        } catch (_) {}
    }, true);
})();
