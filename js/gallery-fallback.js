window.WD = window.WD || {};

WD.GalleryFallback = class GalleryFallback {
    constructor(root, openHandler) {
        this.root = root;
        this.openHandler = openHandler;
        this.activeCard = null;
        this.mobilePageSize = WD.runtime.isLowEnd ? 4 : 6;
        this._mobileWishes = [];
        this._mobileRendered = 0;
        this._mobileMoreBtn = null;
        var self = this;
        document.addEventListener("touchstart", function (e) {
            if (!WD.runtime.isMobile) return;
            if (!self.root.contains(e.target)) { self._clearActive(); return; }
            if (!e.target.closest(".letter-card")) self._clearActive();
        }, { passive: true });
    }

    _clearActive() {
        if (this.activeCard) {
            this.activeCard.classList.remove("active");
            this.activeCard = null;
        }
    }

    _setActive(card) {
        if (!WD.runtime.isMobile) return;
        if (this.activeCard && this.activeCard !== card) this.activeCard.classList.remove("active");
        this.activeCard = card;
        card.classList.add("active");
    }

    _buildCard(item, index, isMobile) {
        var self = this;
        var U = WD.Utils;
        var card = document.createElement("article");
        card.className = "letter-card";
        card.style.setProperty("--drop-delay", (index * 0.11).toFixed(2) + "s");
        card.style.setProperty("--drop-duration", (isMobile ? U.random(1.35, 1.95) : U.random(1.6, 2.35)).toFixed(2) + "s");
        card.style.setProperty("--float-y", (isMobile ? U.random(6, 10) : U.random(12, 18)).toFixed(2) + "px");
        card.style.setProperty("--float-r", U.random(2.2, 4).toFixed(2) + "deg");
        card.style.setProperty("--float-duration", U.random(5, 9).toFixed(2) + "s");
        card.style.setProperty("--float-delay", U.random(0, 3).toFixed(2) + "s");

        var floatWrap = document.createElement("div");
        floatWrap.className = "float-wrap";
        var inner = document.createElement("div");
        inner.className = "letter-card-inner";
        var icon = document.createElement("div");
        icon.className = "card-icon";
        icon.textContent = "\uD83D\uDC8C";
        var to = document.createElement("h3");
        to.className = "card-to";
        to.textContent = item.to || "Người phụ nữ tuyệt vời";
        var from = document.createElement("p");
        from.className = "card-from";
        from.textContent = item.from || "Ẩn danh";
        var openBtn = document.createElement("button");
        openBtn.type = "button";
        openBtn.className = "open-letter";
        openBtn.textContent = "Mở thư \uD83D\uDC8C";
        openBtn.addEventListener("click", function (e) {
            e.stopPropagation();
            self.openHandler(item);
        });

        inner.appendChild(icon);
        inner.appendChild(to);
        inner.appendChild(from);
        inner.appendChild(openBtn);
        floatWrap.appendChild(inner);
        card.appendChild(floatWrap);

        if (!isMobile) {
            card.addEventListener("click", function () { self.openHandler(item); });
        } else {
            var touchX = 0;
            var touchY = 0;
            var touchStartAt = 0;
            var lastTouchHandledAt = 0;
            card.addEventListener("touchstart", function (e) {
                var t = e.touches && e.touches[0];
                if (!t) return;
                touchX = t.clientX;
                touchY = t.clientY;
                touchStartAt = performance.now();
            }, { passive: true });
            card.addEventListener("touchend", function (e) {
                var t = e.changedTouches && e.changedTouches[0];
                if (!t) return;
                var dx = Math.abs(t.clientX - touchX);
                var dy = Math.abs(t.clientY - touchY);
                var dt = performance.now() - touchStartAt;
                if (dx > 12 || dy > 12 || dt > 350) return;
                lastTouchHandledAt = performance.now();
                if (self.activeCard === card) self.openHandler(item);
                else self._setActive(card);
            }, { passive: true });
            card.addEventListener("click", function (e) {
                if (e.target.closest(".open-letter")) return;
                if (performance.now() - lastTouchHandledAt < 450) return;
                if (self.activeCard === card) self.openHandler(item);
                else self._setActive(card);
            });
        }
        return card;
    }

    _removeMobileMoreBtn() {
        if (this._mobileMoreBtn && this._mobileMoreBtn.parentNode) {
            this._mobileMoreBtn.parentNode.removeChild(this._mobileMoreBtn);
        }
        this._mobileMoreBtn = null;
    }

    _renderNextMobileBatch() {
        this._removeMobileMoreBtn();
        if (!this._mobileWishes.length) return;

        var start = this._mobileRendered;
        var end = Math.min(start + this.mobilePageSize, this._mobileWishes.length);
        for (var i = start; i < end; i++) {
            this.root.appendChild(this._buildCard(this._mobileWishes[i], i - start, true));
        }
        this._mobileRendered = end;

        var remaining = this._mobileWishes.length - this._mobileRendered;
        if (remaining <= 0) return;

        var self = this;
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "mobile-load-more";
        btn.textContent = "Xem thêm " + Math.min(this.mobilePageSize, remaining) + " lá thư (" + remaining + " còn lại)";
        btn.addEventListener("click", function () { self._renderNextMobileBatch(); });
        this.root.appendChild(btn);
        this._mobileMoreBtn = btn;
    }

    render(data) {
        this.root.innerHTML = "";
        this._removeMobileMoreBtn();
        this._clearActive();
        WD.runtime.isMobile = window.innerWidth < 768;
        var wishes = Array.isArray(data) ? data : [];
        this.root.classList.toggle("mobile-layout", WD.runtime.isMobile);
        this.mobilePageSize = WD.runtime.isLowEnd ? 4 : (window.innerWidth < 430 ? 4 : 6);

        if (!wishes.length) return;

        var self = this;
        var U = WD.Utils;

        if (WD.runtime.isMobile) {
            this._mobileWishes = wishes;
            this._mobileRendered = 0;
            this._renderNextMobileBatch();
            return;
        }

        this._mobileWishes = [];
        this._mobileRendered = 0;

        var width = Math.max(self.root.clientWidth || 0, window.innerWidth * 0.86);
        var height = Math.max(self.root.clientHeight || 0, window.innerHeight * 0.7);
        var cardW = 155, cardH = 195;
        var cols = Math.max(3, Math.ceil(Math.sqrt(wishes.length * (width / height) * 0.88)));
        var rows = Math.max(1, Math.ceil(wishes.length / cols));
        var cellW = width / cols;
        var cellH = height / rows;

        wishes.forEach(function (item, i) {
            var row = Math.floor(i / cols);
            var col = i % cols;
            var x = col * cellW + (cellW - cardW) / 2 + U.random(-80, 80);
            var y = row * cellH + (cellH - cardH) / 2 + U.random(-76, 76);
            var z = U.random(-100, 100);
            x = U.clamp(x, -cardW * 0.3, width - cardW * 0.7);
            y = U.clamp(y, -cardH * 0.3, height - cardH * 0.7);

            var card = self._buildCard(item, i, false);
            card.style.setProperty("--x", x.toFixed(2) + "px");
            card.style.setProperty("--y", y.toFixed(2) + "px");
            card.style.setProperty("--z", z.toFixed(2) + "px");
            self.root.appendChild(card);
        });
    }
};
