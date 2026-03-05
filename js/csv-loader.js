window.WD = window.WD || {};

WD.CSVLoader = (() => {
    const wishes = [];

    const GOOGLE_SYNC = {
        enabled: true,
        csvUrl: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRTh4saMOkoRXC-f-H5zLdeW46IcXz-3T0c3aR3hZz2AHS9c9CtfFc_9dNa78wyUfKZMZGBy5nMN44_/pub?gid=721584308&single=true&output=csv',
        fromHeader: 'Tên người gửi lời chúc',
        messageHeader: 'Lời chúc dành cho các bạn nữ',
        timestampHeader: 'Dấu thời gian',
        to: 'Tất cả các bạn nữ',
        autoRefreshMs: 45000,
        timestampDayFirst: true
    };

    const DYNAMIC_AVATARS = ["🌸", "💖", "✨", "🌷", "🎀", "💐", "🌟"];
    const DYNAMIC_COLORS = ["#ff6b9d", "#f78fb3", "#c56cf0", "#f8a5c2", "#f3a683", "#cf6a87"];

    let syncInProgress = false;
    let autoRefreshTimer = 0;
    let lastSyncSignature = "";
    let onDataChange = () => {};

    function normalizeKey(value) {
        return String(value || "")
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, " ")
            .trim();
    }

    function normalizeText(value) {
        return String(value || "")
            .replace(/\u00A0/g, " ")
            .replace(/\s+/g, " ")
            .trim();
    }

    function normalizeMessage(value) {
        return String(value || "")
            .replace(/\u00A0/g, " ")
            .replace(/\r\n/g, "\n")
            .replace(/\r/g, "\n")
            .split("\n")
            .map((line) => line.replace(/[ \t]+/g, " ").trim())
            .join("\n")
            .replace(/\n{3,}/g, "\n\n")
            .trim();
    }

    function parseTimestampMs(value, dayFirst) {
        const text = normalizeText(value);
        if (!text) return NaN;
        const m = text.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
        if (m) {
            const a = Number(m[1]);
            const b = Number(m[2]);
            let year = Number(m[3]);
            if (year < 100) year += 2000;
            let day = dayFirst ? a : b;
            let month = dayFirst ? b : a;
            if (a > 12 && b <= 12) { day = a; month = b; }
            if (b > 12 && a <= 12) { day = b; month = a; }
            const hour = Number(m[4] || 0);
            const minute = Number(m[5] || 0);
            const second = Number(m[6] || 0);
            const d = new Date(year, month - 1, day, hour, minute, second);
            if (!Number.isNaN(d.getTime()) && d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day) {
                return d.getTime();
            }
        }
        const direct = Date.parse(text);
        return Number.isFinite(direct) ? direct : NaN;
    }

    function buildDedupeKey(timestamp, from, message) {
        return [normalizeKey(timestamp), normalizeKey(from), normalizeKey(message)].join("|");
    }

    function formatClock(ts) {
        return new Date(ts || Date.now()).toLocaleTimeString("vi-VN", {
            hour: "2-digit",
            minute: "2-digit"
        });
    }

    function parseCsv(csvText) {
        const rows = [];
        const text = String(csvText || "").replace(/^\uFEFF/, "");
        let row = [];
        let cell = "";
        let inQuote = false;

        for (let i = 0; i < text.length; i++) {
            const ch = text[i];
            if (ch === "\"") {
                if (inQuote && text[i + 1] === "\"") {
                    cell += "\"";
                    i++;
                } else {
                    inQuote = !inQuote;
                }
                continue;
            }
            if (ch === "," && !inQuote) {
                row.push(cell.trim());
                cell = "";
                continue;
            }
            if ((ch === "\n" || ch === "\r") && !inQuote) {
                if (ch === "\r" && text[i + 1] === "\n") i++;
                row.push(cell.trim());
                if (row.some((v) => v.length > 0)) rows.push(row);
                row = [];
                cell = "";
                continue;
            }
            cell += ch;
        }
        row.push(cell.trim());
        if (row.some((v) => v.length > 0)) rows.push(row);
        return rows;
    }

    function findColumnIndex(headers, preferredLabel, fallbackTokens) {
        const normalizedHeaders = headers.map(normalizeKey);
        const preferred = normalizeKey(preferredLabel);
        let idx = normalizedHeaders.findIndex((h) => h === preferred);
        if (idx >= 0) return idx;
        idx = normalizedHeaders.findIndex((h) => fallbackTokens.every((t) => h.includes(t)));
        return idx;
    }

    function buildWish(from, message, idx, to) {
        return {
            from,
            message,
            to: to || GOOGLE_SYNC.to || "Những người phụ nữ tuyệt vời",
            avatar: DYNAMIC_AVATARS[idx % DYNAMIC_AVATARS.length],
            color: DYNAMIC_COLORS[idx % DYNAMIC_COLORS.length]
        };
    }

    function replaceWishes(nextWishes) {
        wishes.length = 0;
        nextWishes.forEach((w) => wishes.push(w));
    }

    function stopAutoRefresh() {
        if (!autoRefreshTimer) return;
        clearInterval(autoRefreshTimer);
        autoRefreshTimer = 0;
    }

    function startAutoRefresh() {
        stopAutoRefresh();
        if (!GOOGLE_SYNC.enabled || !GOOGLE_SYNC.csvUrl) return;
        const intervalMs = Math.max(30000, Math.min(60000, Number(GOOGLE_SYNC.autoRefreshMs) || 45000));
        autoRefreshTimer = setInterval(() => {
            syncWishes({ showLoading: false, silent: true });
        }, intervalMs);
    }

    async function loadWishesFromGoogleSheet(options) {
        options = options || {};
        const silent = !!options.silent;
        if (!GOOGLE_SYNC.enabled) {
            if (!silent) WD.setSyncStatus("Đang tắt đồng bộ Google Sheet.", "warn");
            return { ok: false, changed: false, reason: "sync-disabled" };
        }
        if (!GOOGLE_SYNC.csvUrl) {
            if (!silent) WD.setSyncStatus("Chưa dán CSV URL.", "warn");
            return { ok: false, changed: false, reason: "missing-csv-url" };
        }

        try {
            const res = await fetch(GOOGLE_SYNC.csvUrl, { cache: "no-store" });
            if (!res.ok) throw new Error("HTTP " + res.status);
            const csv = await res.text();
            const rows = parseCsv(csv);
            if (rows.length < 2) throw new Error("Sheet chưa có dữ liệu");

            const headers = rows[0];
            const fromIdx = findColumnIndex(headers, GOOGLE_SYNC.fromHeader, ["ten", "nguoi", "gui"]);
            let msgIdx = findColumnIndex(headers, GOOGLE_SYNC.messageHeader, ["noi", "dung", "thu"]);
            if (msgIdx < 0) msgIdx = findColumnIndex(headers, GOOGLE_SYNC.messageHeader, ["loi", "chuc"]);
            const toIdx = GOOGLE_SYNC.toHeader ? findColumnIndex(headers, GOOGLE_SYNC.toHeader, ["ten", "nguoi", "nhan"]) : -1;
            let tsIdx = findColumnIndex(headers, GOOGLE_SYNC.timestampHeader, ["timestamp"]);
            if (tsIdx < 0) tsIdx = findColumnIndex(headers, "thoi gian", ["thoi", "gian"]);
            if (fromIdx < 0 || msgIdx < 0) throw new Error("Không tìm thấy đúng cột dữ liệu");

            const dayFirst = GOOGLE_SYNC.timestampDayFirst !== false;
            const seen = new Set();
            const imported = [];
            for (let i = 1; i < rows.length; i++) {
                const row = rows[i];
                const timestamp = tsIdx >= 0 ? normalizeText(row[tsIdx]) : "";
                const from = normalizeText(row[fromIdx]);
                const to = toIdx >= 0 ? normalizeText(row[toIdx]) : "";
                const message = normalizeMessage(row[msgIdx]);
                if (!from || !message) continue;
                const dedupeKey = buildDedupeKey(timestamp, from, message);
                if (seen.has(dedupeKey)) continue;
                seen.add(dedupeKey);
                imported.push({ from, to, message, rowIndex: i, timestampMs: parseTimestampMs(timestamp, dayFirst), dedupeKey });
            }
            if (!imported.length) throw new Error("Không có dòng hợp lệ");

            imported.sort((a, b) => {
                const at = Number.isFinite(a.timestampMs) ? a.timestampMs : -Infinity;
                const bt = Number.isFinite(b.timestampMs) ? b.timestampMs : -Infinity;
                if (at !== bt) return bt - at;
                return b.rowIndex - a.rowIndex;
            });

            const signature = imported.map((item) => item.dedupeKey + "|" + normalizeKey(item.to)).join("||");
            if (signature === lastSyncSignature) {
                if (!silent) WD.setSyncStatus("Đã đồng bộ " + imported.length + " thư lúc " + formatClock(), "ok");
                return { ok: true, changed: false, count: imported.length };
            }

            const mapped = imported.map((item, idx) => buildWish(item.from, item.message, idx, item.to));
            replaceWishes(mapped);
            lastSyncSignature = signature;
            if (!silent) WD.setSyncStatus("Đã tải " + mapped.length + " thư lúc " + formatClock(), "ok");
            return { ok: true, changed: true, count: mapped.length };
        } catch (err) {
            console.warn("[GOOGLE_SYNC] Không tải được dữ liệu:", err);
            if (!silent) WD.setSyncStatus("Link Sheet lỗi hoặc chưa public.", "warn");
            return { ok: false, changed: false, error: err };
        }
    }

    async function syncWishes(options) {
        options = options || {};
        const manual = !!options.manual;
        const showLoading = options.showLoading !== false;
        const silent = !!options.silent;
        if (syncInProgress) return { ok: false, changed: false, reason: "sync-busy" };
        syncInProgress = true;
        if (manual) WD.setReloadButtonBusy(true);
        if (showLoading) WD.setGalleryLoading(true);
        if (showLoading && !silent) WD.setSyncStatus("Đang tải dữ liệu...", "info");

        try {
            const result = await loadWishesFromGoogleSheet({ silent });
            onDataChange(result);
            return result;
        } finally {
            if (manual) WD.setReloadButtonBusy(false);
            if (showLoading) WD.setGalleryLoading(false);
            syncInProgress = false;
        }
    }

    return {
        getWishes: () => wishes,
        syncWishes,
        startAutoRefresh,
        stopAutoRefresh,
        setOnDataChange(handler) {
            onDataChange = typeof handler === "function" ? handler : () => {};
        }
    };
})();
