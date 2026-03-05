window.WD = window.WD || {};

WD.App = {
    world: null,
    intro: null,
    background: null,
    gallery: null,
    galleryFallback: null,
    modal: null,
    introDone: false,
    mainShown: false,
    useWebGL: false,
    resizeRaf: 0,
    titleClicks: 0,
    titleResetTimer: 0,

    init: function () {
        WD.initDom();

        var self = this;
        this.modal = new WD.ModalController(
            function () { if (self.world) self.world.setPaused(true); },
            function () { if (self.world && !document.hidden) self.world.setPaused(false); }
        );

        WD.CSVLoader.setOnDataChange(function (result) {
            if (result && result.changed === false) return;
            self._renderGallery();
        });

        this._bindUI();
        this._renderGallery();

        WD.CSVLoader.syncWishes({ showLoading: true }).then(function () {
            self._renderGallery();
        });
        WD.CSVLoader.startAutoRefresh();

        this._startVisualFlow();
    },

    _bindUI: function () {
        var self = this;
        WD.dom.reloadBtn.addEventListener("click", function () {
            WD.CSVLoader.syncWishes({ manual: true, showLoading: true });
        });

        WD.dom.siteTitle.addEventListener("click", function () {
            self.titleClicks += 1;
            clearTimeout(self.titleResetTimer);
            if (self.titleClicks >= 3) {
                self.titleClicks = 0;
                WD.launchTitleConfetti(WD.dom.siteTitle);
            }
            self.titleResetTimer = setTimeout(function () { self.titleClicks = 0; }, 1400);
        });

        window.addEventListener("resize", function () { self._handleResize(); }, { passive: true });
        document.addEventListener("visibilitychange", function () { self._handleVisibility(); });
        window.addEventListener("beforeunload", function () { self._destroy(); }, { once: true });
    },

    _startVisualFlow: function () {
        var self = this;
        this.world = new WD.ThreeWorld();
        var canUseWebGL = this.world.init();

        if (!canUseWebGL) {
            document.documentElement.classList.add("no-webgl");
            WD.setSyncStatus("Thiết bị không hỗ trợ WebGL, đang dùng hiệu ứng CSS.", "warn");
            this._fallbackIntro();
            return;
        }

        this.useWebGL = true;
        document.documentElement.classList.add("webgl-mode");

        document.fonts.ready.then(function () {
            self.intro = new WD.ThreeIntro(self.world, function () { self._finishIntro(); });
            self.world.setIntro(self.intro);
        });
    },

    _fallbackIntro: function () {
        var self = this;
        this.useWebGL = false;
        var done = function () {
            if (self.introDone) return;
            self.introDone = true;
            WD.dom.introScreen.classList.add("is-done");
            self._showMain();
        };
        WD.dom.skipIntro.addEventListener("click", done, { once: true });
        setTimeout(done, WD.reduceMotionQuery.matches ? 180 : 1200);
    },

    _finishIntro: function () {
        if (this.introDone) return;
        this.introDone = true;

        this.background = new WD.ThreeBackground(this.world);
        this.world.setBackground(this.background);

        // Zoom camera out so all cards are visible, especially on mobile
        var wishes = WD.CSVLoader.getWishes();
        var count = Math.max(1, wishes.length);
        var cols = Math.max(2, Math.ceil(Math.sqrt(count * 1.3)));
        var rows = Math.ceil(count / cols);
        var cardW = WD.runtime.isMobile ? 60 : 80;
        var cardH = WD.runtime.isMobile ? 78 : 104;
        var gapX = cardW * 1.4;
        var gapY = cardH * 1.2;
        var gridW = cols * gapX;
        var gridH = rows * gapY;
        // FOV is 60°, so visible height at distance z ≈ 2 * z * tan(30°) ≈ z * 1.15
        // Add padding so cards aren't clipped at edges
        var neededZ = Math.max(gridW / (this.world.camera.aspect * 1.15), gridH / 1.15) + 80;
        neededZ = Math.max(neededZ, WD.runtime.isMobile ? 500 : 420);
        neededZ = Math.min(neededZ, 750); // don't go too far
        this.world.targetZ = neededZ;

        var self = this;
        this.gallery = new WD.Gallery3D(this.world, function (item) { self.modal.open(item); });
        this.world.setGallery(this.gallery);
        this.gallery.render(WD.CSVLoader.getWishes());

        this.world.enableInteraction();
        this._showMain();
    },

    _showMain: function () {
        if (this.mainShown) return;
        this.mainShown = true;
        WD.dom.mainPage.classList.add("visible");
        this._renderGallery();
    },

    _renderGallery: function () {
        var data = WD.CSVLoader.getWishes();

        if (this.useWebGL && this.gallery) {
            this.gallery.render(data);
        } else if (!this.useWebGL) {
            if (!this.galleryFallback && WD.dom.galleryFallback) {
                var self = this;
                WD.dom.galleryFallback.hidden = false;
                this.galleryFallback = new WD.GalleryFallback(WD.dom.galleryFallback, function (item) {
                    self.modal.open(item);
                });
            }
            if (this.galleryFallback) {
                this.galleryFallback.render(data);
            }
        }

        WD.dom.letterCounter.textContent = "\uD83D\uDC9D Có " + data.length + " lá thư yêu thương đang chờ bạn";
    },

    _handleVisibility: function () {
        if (!this.world) return;
        if (document.hidden) this.world.setPaused(true);
        else if (!this.modal.isOpen()) this.world.setPaused(false);
    },

    _handleResize: function () {
        var self = this;
        if (this.resizeRaf) return;
        this.resizeRaf = requestAnimationFrame(function () {
            self.resizeRaf = 0;
            WD.runtime.isMobile = window.innerWidth < 768;
            WD.runtime.isLowEnd = (navigator.hardwareConcurrency || 4) <= 4;
            self._renderGallery();
        });
    },

    _destroy: function () {
        WD.CSVLoader.stopAutoRefresh();
        if (this.world) this.world.dispose();
    }
};

document.addEventListener("DOMContentLoaded", function () {
    WD.App.init();
});
