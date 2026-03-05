window.WD = window.WD || {};

WD.Utils = {
    clamp(value, min, max) {
        return Math.min(max, Math.max(min, value));
    },
    random(min, max) {
        return min + Math.random() * (max - min);
    },
    randomInt(min, max) {
        return Math.floor(this.random(min, max + 1));
    },
    randomPointInSphere(radius) {
        const u = Math.random();
        const v = Math.random();
        const theta = u * Math.PI * 2;
        const phi = Math.acos(2 * v - 1);
        const r = Math.cbrt(Math.random()) * radius;
        return {
            x: r * Math.sin(phi) * Math.cos(theta),
            y: r * Math.sin(phi) * Math.sin(theta),
            z: r * Math.cos(phi)
        };
    }
};

WD.dom = null;
WD.initDom = function () {
    WD.dom = {
        threeRoot: document.getElementById("three-root"),
        introScreen: document.getElementById("intro-screen"),
        introTitle: document.getElementById("intro-title"),
        skipIntro: document.getElementById("skip-intro"),
        mainPage: document.getElementById("main-page"),
        galleryFallback: document.getElementById("gallery-fallback"),
        loadingState: document.getElementById("loading-state"),
        reloadBtn: document.getElementById("reload-btn"),
        reloadLabel: document.getElementById("reload-label"),
        letterCounter: document.getElementById("letter-counter"),
        syncStatus: document.getElementById("sync-status"),
        modalOverlay: document.getElementById("modal-overlay"),
        modalClose: document.getElementById("modal-close"),
        modalTitle: document.getElementById("modal-title"),
        modalSub: document.getElementById("modal-sub"),
        modalBody: document.getElementById("modal-body"),
        modalPetals: document.getElementById("modal-petals"),
        siteTitle: document.getElementById("site-title"),
        confettiLayer: document.getElementById("confetti-layer")
    };
};

WD.setSyncStatus = function (text, tone) {
    if (!WD.dom || !WD.dom.syncStatus) return;
    WD.dom.syncStatus.textContent = text;
    WD.dom.syncStatus.classList.remove("info", "ok", "warn");
    WD.dom.syncStatus.classList.add(tone || "info");
};

WD.setReloadButtonBusy = function (isBusy) {
    if (!WD.dom || !WD.dom.reloadBtn || !WD.dom.reloadLabel) return;
    WD.dom.reloadBtn.disabled = !!isBusy;
    WD.dom.reloadBtn.classList.toggle("busy", !!isBusy);
    WD.dom.reloadLabel.textContent = isBusy ? "Đang tải..." : "Tải lại dữ liệu";
};

WD.setGalleryLoading = function (isLoading) {
    if (!WD.dom || !WD.dom.loadingState) return;
    WD.dom.loadingState.hidden = !isLoading;
};

WD.reduceMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
