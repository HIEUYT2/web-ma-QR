window.WD = window.WD || {};

WD.ThreeWorld = class ThreeWorld {
    constructor() {
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 2000);
        this.camera.position.set(0, 0, 420);
        this.renderer = null;
        this.clock = new THREE.Clock();
        this.running = false;
        this.paused = false;
        this.elapsed = 0;
        this.intro = null;
        this.background = null;
        this.gallery = null;
        this.targetX = 0;
        this.targetY = 0;
        this.targetZ = 420;
        this.handlers = [];
        this.animate = this.animate.bind(this);
    }

    init() {
        if (!window.WebGLRenderingContext || typeof THREE === "undefined") return false;
        try {
            this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
        } catch (e) {
            console.warn("WebGL init fail:", e);
            return false;
        }

        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, WD.runtime.isMobile ? 1.5 : 2));
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.domElement.className = "bg-canvas";
        WD.dom.threeRoot.appendChild(this.renderer.domElement);

        this.bindParallax();
        this.bindZoom();
        window.addEventListener("resize", () => this.handleResize(), { passive: true });
        this.running = true;
        requestAnimationFrame(this.animate);
        return true;
    }

    bindParallax() {
        var self = this;
        var U = WD.Utils;
        var onMove = function (e) {
            if (WD.runtime.isMobile) return;
            var nx = e.clientX / Math.max(1, window.innerWidth) - 0.5;
            var ny = e.clientY / Math.max(1, window.innerHeight) - 0.5;
            self.targetX = U.clamp(nx * 60, -30, 30);
            self.targetY = U.clamp(-ny * 60, -30, 30);
        };
        var onOrientation = function (e) {
            if (!WD.runtime.isMobile) return;
            var gamma = U.clamp(e.gamma || 0, -20, 20);
            var beta = U.clamp(e.beta || 0, -20, 20);
            self.targetX = (gamma / 20) * 30;
            self.targetY = (-beta / 20) * 30;
        };

        window.addEventListener("mousemove", onMove, { passive: true });
        window.addEventListener("deviceorientation", onOrientation, true);
        this.handlers.push(function () { window.removeEventListener("mousemove", onMove); });
        this.handlers.push(function () { window.removeEventListener("deviceorientation", onOrientation, true); });
    }

    bindZoom() {
        var self = this;
        var onWheel = function (e) {
            // Only zoom when intro is done
            if (self.intro && self.intro.active) return;
            e.preventDefault();
            var delta = e.deltaY > 0 ? 25 : -25;
            self.targetZ = WD.Utils.clamp(self.targetZ + delta, 120, 800);
        };
        var canvas = this.renderer.domElement;
        canvas.addEventListener("wheel", onWheel, { passive: false });
        this.handlers.push(function () { canvas.removeEventListener("wheel", onWheel); });

        // Pinch zoom for mobile
        var lastPinchDist = 0;
        var onTouchStart = function (e) {
            if (e.touches.length === 2) {
                var dx = e.touches[0].clientX - e.touches[1].clientX;
                var dy = e.touches[0].clientY - e.touches[1].clientY;
                lastPinchDist = Math.sqrt(dx * dx + dy * dy);
            }
        };
        var onTouchMove = function (e) {
            if (self.intro && self.intro.active) return;
            if (e.touches.length === 2) {
                var dx = e.touches[0].clientX - e.touches[1].clientX;
                var dy = e.touches[0].clientY - e.touches[1].clientY;
                var dist = Math.sqrt(dx * dx + dy * dy);
                if (lastPinchDist > 0) {
                    var diff = (lastPinchDist - dist) * 0.8;
                    self.targetZ = WD.Utils.clamp(self.targetZ + diff, 120, 800);
                }
                lastPinchDist = dist;
            }
        };
        var onTouchEnd = function () { lastPinchDist = 0; };
        canvas.addEventListener("touchstart", onTouchStart, { passive: true });
        canvas.addEventListener("touchmove", onTouchMove, { passive: true });
        canvas.addEventListener("touchend", onTouchEnd, { passive: true });
        this.handlers.push(function () {
            canvas.removeEventListener("touchstart", onTouchStart);
            canvas.removeEventListener("touchmove", onTouchMove);
            canvas.removeEventListener("touchend", onTouchEnd);
        });
    }

    setIntro(intro) { this.intro = intro; }
    setBackground(bg) { this.background = bg; }
    setGallery(g) { this.gallery = g; }

    setPaused(p) { this.paused = !!p; }

    enableInteraction() {
        if (this.renderer) {
            this.renderer.domElement.style.pointerEvents = "auto";
        }
    }

    disableInteraction() {
        if (this.renderer) {
            this.renderer.domElement.style.pointerEvents = "none";
        }
    }

    handleResize() {
        WD.runtime.isMobile = window.innerWidth < 768;
        WD.runtime.isLowEnd = (navigator.hardwareConcurrency || 4) <= 4;
        this.camera.aspect = window.innerWidth / Math.max(1, window.innerHeight);
        this.camera.updateProjectionMatrix();
        if (this.renderer) {
            this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, WD.runtime.isMobile ? 1.5 : 2));
            this.renderer.setSize(window.innerWidth, window.innerHeight);
        }
    }

    animate(now) {
        if (!this.running) return;
        var dt = Math.min(0.05, this.clock.getDelta());

        if (!this.paused) {
            this.elapsed += dt;
            if (this.intro && this.intro.active) this.intro.update(dt);
            if (this.background) this.background.update(dt, now);
            if (this.gallery) this.gallery.update(dt, this.elapsed);
            this.camera.position.x += (this.targetX - this.camera.position.x) * 0.02;
            this.camera.position.y += (this.targetY - this.camera.position.y) * 0.02;
            // Smooth zoom
            if (!this.intro || !this.intro.active) {
                this.camera.position.z += (this.targetZ - this.camera.position.z) * 0.05;
            }
            this.camera.lookAt(0, 0, 0);
        }

        if (this.renderer) this.renderer.render(this.scene, this.camera);
        requestAnimationFrame(this.animate);
    }

    dispose() {
        this.running = false;
        this.handlers.forEach(function (fn) { fn(); });
        this.handlers = [];
        if (this.gallery) this.gallery.dispose();
        if (this.background) this.background.dispose();
        if (this.intro) this.intro.dispose();
        if (this.renderer) {
            this.renderer.dispose();
            if (this.renderer.domElement && this.renderer.domElement.parentNode) {
                this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
            }
        }
    }
};
