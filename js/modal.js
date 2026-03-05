window.WD = window.WD || {};

WD.ModalController = class ModalController {
    constructor(onOpen, onClose) {
        this.onOpen = onOpen;
        this.onClose = onClose;
        this.opened = false;
        this._bindEvents();
    }

    _bindEvents() {
        var self = this;
        WD.dom.modalClose.addEventListener("click", function () { self.close(); });
        WD.dom.modalOverlay.addEventListener("click", function (e) {
            if (e.target === WD.dom.modalOverlay) self.close();
        });
        document.addEventListener("keydown", function (e) {
            if (e.key === "Escape") self.close();
        });
    }

    isOpen() { return this.opened; }

    _spawnPetals() {
        WD.dom.modalPetals.innerHTML = "";
        var symbols = ["\uD83C\uDF38", "\uD83C\uDF37", "\uD83C\uDF3A"];
        var U = WD.Utils;
        for (var i = 0; i < 6; i++) {
            var petal = document.createElement("span");
            petal.className = "modal-petal";
            petal.textContent = symbols[i % symbols.length];
            petal.style.left = U.random(10, 90).toFixed(2) + "%";
            petal.style.animationDelay = (i * 0.2).toFixed(2) + "s";
            petal.style.setProperty("--drift", U.random(-36, 36).toFixed(1) + "px");
            WD.dom.modalPetals.appendChild(petal);
        }
    }

    open(item) {
        if (!item) return;
        this.opened = true;
        // Haptic feedback on mobile
        if (navigator.vibrate) navigator.vibrate(10);

        WD.dom.modalTitle.textContent = "\uD83D\uDC8C Thư gửi " + (item.to || "người phụ nữ tuyệt vời");
        WD.dom.modalSub.textContent = "Từ: " + (item.from || "Ẩn danh") + "  •  8/3/2025";
        WD.dom.modalBody.innerHTML = "";

        this._spawnPetals();
        WD.dom.modalOverlay.classList.remove("closing");
        WD.dom.modalOverlay.classList.add("show");
        requestAnimationFrame(function () { WD.dom.modalOverlay.classList.add("active"); });
        document.body.classList.add("modal-open");
        if (this.onOpen) this.onOpen();

        // Typewriter effect after modal appears
        var paragraphs = String(item.message || "").split(/\n+/).map(function (l) { return l.trim(); }).filter(Boolean);
        if (!paragraphs.length) paragraphs = ["..."];
        this._typewriterParagraphs(paragraphs);
    }

    _typewriterParagraphs(paragraphs) {
        var body = WD.dom.modalBody;
        body.innerHTML = "";
        var self = this;
        var pIndex = 0;
        var charIndex = 0;
        var currentP = null;
        var delay = 28; // ms per character
        var timer = null;

        // Cancel any existing typewriter
        if (this._typewriterTimer) clearTimeout(this._typewriterTimer);

        var type = function () {
            if (!self.opened) return; // modal closed
            if (pIndex >= paragraphs.length) return;

            if (charIndex === 0) {
                currentP = document.createElement("p");
                body.appendChild(currentP);
            }

            var text = paragraphs[pIndex];
            currentP.textContent = text.slice(0, charIndex + 1);
            charIndex++;

            if (charIndex >= text.length) {
                charIndex = 0;
                pIndex++;
                // Pause between paragraphs
                self._typewriterTimer = setTimeout(type, 180);
            } else {
                self._typewriterTimer = setTimeout(type, delay);
            }
        };

        // Small initial delay so modal animation starts first
        this._typewriterTimer = setTimeout(type, 350);
    }

    close() {
        if (!this.opened) return;
        this.opened = false;
        if (this._typewriterTimer) { clearTimeout(this._typewriterTimer); this._typewriterTimer = null; }
        WD.dom.modalOverlay.classList.add("closing");
        WD.dom.modalOverlay.classList.remove("active");
        setTimeout(function () {
            WD.dom.modalOverlay.classList.remove("show", "closing");
            WD.dom.modalPetals.innerHTML = "";
        }, 220);
        document.body.classList.remove("modal-open");
        if (this.onClose) this.onClose();
    }
};
