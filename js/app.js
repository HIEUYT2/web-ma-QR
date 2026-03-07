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
        this._startVisualFlow();
        this._renderGallery();

        WD.CSVLoader.syncWishes({ showLoading: true }).then(function () {
            self._renderGallery();
        });
        WD.CSVLoader.startAutoRefresh();
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
            WD.setSyncStatus("Thiết bị không hỗ trợ WebGL, dang dung hieu ung CSS.", "warn");
            this._fallbackIntro();
            return;
        }

        this.useWebGL = true;
        document.documentElement.classList.add("webgl-mode");

        // Garden SVG animation plays first, then particle intro starts
        this.garden = new WD.GardenIntro(function () {
            self.garden = null;
            document.fonts.ready.then(function () {
                self.intro = new WD.ThreeIntro(self.world, function () { self._finishIntro(); });
                self.world.setIntro(self.intro);
            });
        });

        // Skip-intro button also skips garden
        var skipHandler = function () {
            if (self.garden) {
                self.garden.skip();
            }
        };
        WD.dom.skipIntro.addEventListener("click", skipHandler, { once: true });
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

        if (this.useWebGL) {
            if (WD.dom.galleryFallback) WD.dom.galleryFallback.hidden = true;
            if (this.gallery) this.gallery.render(data);
        } else {
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
        if (this.garden) this.garden.dispose();
        if (this.world) this.world.dispose();
    }
};

document.addEventListener("DOMContentLoaded", function () {
    WD.App.init();
});
