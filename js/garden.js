window.WD = window.WD || {};

WD.GardenIntro = class GardenIntro {
    constructor(onDone) {
        this.onDone = onDone;
        this.el = null;
        this._done = false;
        this._timers = [];
        this._started = false;
        this._build();
    }

    _setTimer(fn, delay) {
        var self = this;
        var t = setTimeout(function () {
            if (self._done) return;
            fn();
        }, delay);
        this._timers.push(t);
        return t;
    }

    _clearTimers() {
        if (!this._timers) return;
        for (var i = 0; i < this._timers.length; i++) {
            clearTimeout(this._timers[i]);
        }
        this._timers.length = 0;
    }

    _build() {
        var container = document.createElement("div");
        container.id = "garden-intro";
        container.innerHTML = this._html();
        document.body.appendChild(container);
        this.el = container;

        var style = document.createElement("style");
        style.textContent = this._css();
        container.appendChild(style);

        var self = this;
        var startSequence = function () {
            if (self._started) return;
            self._started = true;
            self._setTimer(function () { self._fadeOut(); }, 9000);
        };

        var frame = container.querySelector(".garden-iframe");
        if (frame) {
            frame.addEventListener("load", startSequence, { once: true });
            this._setTimer(startSequence, 1500);
        } else {
            startSequence();
        }
    }

    _fadeOut() {
        if (this._done) return;
        this._done = true;
        this._clearTimers();
        if (this.el) this.el.classList.add("fading");
        var self = this;
        setTimeout(function () {
            self.dispose();
            if (typeof self.onDone === "function") self.onDone();
        }, 800);
    }

    skip() {
        this._fadeOut();
    }

    _html() {
        return [
            '<iframe',
            '  class="garden-iframe"',
            '  src="Svg/flowers.html"',
            '  title="Flower intro animation"',
            '  aria-hidden="true"',
            '  loading="eager"',
            '></iframe>'
        ].join("\n");
    }

    _css() {
        return [
            '#garden-intro {',
            '  position: fixed;',
            '  inset: 0;',
            '  z-index: 32;',
            '  background: #000;',
            '  opacity: 1;',
            '  transition: opacity 0.8s ease;',
            '  pointer-events: none;',
            '}',
            '#garden-intro.fading { opacity: 0; }',
            '#garden-intro .garden-iframe {',
            '  width: 100%;',
            '  height: 100%;',
            '  border: 0;',
            '  display: block;',
            '}'
        ].join("\n");
    }

    dispose() {
        this._clearTimers();
        if (this.el && this.el.parentNode) {
            this.el.parentNode.removeChild(this.el);
        }
        this.el = null;
    }
};
