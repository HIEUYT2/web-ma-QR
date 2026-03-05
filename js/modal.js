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
        WD.dom.modalTitle.textContent = "\uD83D\uDC8C Thư gửi " + (item.to || "người phụ nữ tuyệt vời");
        WD.dom.modalSub.textContent = "Từ: " + (item.from || "Ẩn danh") + "  •  8/3/2025";
        WD.dom.modalBody.innerHTML = "";
        var paragraphs = String(item.message || "").split(/\n+/).map(function (l) { return l.trim(); }).filter(Boolean);
        (paragraphs.length ? paragraphs : ["..."]).forEach(function (text) {
            var p = document.createElement("p");
            p.textContent = text;
            WD.dom.modalBody.appendChild(p);
        });
        this._spawnPetals();
        WD.dom.modalOverlay.classList.remove("closing");
        WD.dom.modalOverlay.classList.add("show");
        requestAnimationFrame(function () { WD.dom.modalOverlay.classList.add("active"); });
        document.body.classList.add("modal-open");
        if (this.onOpen) this.onOpen();
    }

    close() {
        if (!this.opened) return;
        this.opened = false;
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
