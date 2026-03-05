window.WD = window.WD || {};

WD.Gallery3D = class Gallery3D {
    constructor(world, openHandler) {
        this.world = world;
        this.openHandler = openHandler;
        this.cardMeshes = [];
        this.cardData = [];
        this.floatOffsets = [];
        this.basePositions = [];
        this.group = new THREE.Group();
        this.world.scene.add(this.group);

        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
        this.animatingCard = null;
        this._bound = false;
    }

    _bindEvents() {
        if (this._bound) return;
        this._bound = true;
        var self = this;
        var canvas = this.world.renderer.domElement;

        this._onClick = function (e) { self._handleClick(e); };
        this._onTouchEnd = function (e) { self._handleTouch(e); };

        canvas.addEventListener("click", this._onClick);
        canvas.addEventListener("touchend", this._onTouchEnd);
    }

    _handleClick(e) {
        if (this.animatingCard) return;
        this.mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
        this.mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
        this._cast();
    }

    _handleTouch(e) {
        if (this.animatingCard) return;
        if (!e.changedTouches || !e.changedTouches.length) return;
        var t = e.changedTouches[0];
        this.mouse.x = (t.clientX / window.innerWidth) * 2 - 1;
        this.mouse.y = -(t.clientY / window.innerHeight) * 2 + 1;
        this._cast();
    }

    _cast() {
        this.raycaster.setFromCamera(this.mouse, this.world.camera);
        var hits = this.raycaster.intersectObjects(this.cardMeshes);
        if (hits.length > 0) {
            this._zoomToCard(hits[0].object);
        }
    }

    _zoomToCard(mesh) {
        var self = this;
        this.animatingCard = mesh;

        var camPos = this.world.camera.position.clone();
        var camDir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.world.camera.quaternion);
        var targetPos = camPos.clone().add(camDir.multiplyScalar(50));

        var startPos = mesh.position.clone();
        var startRot = mesh.rotation.clone();
        var startScale = mesh.scale.clone();
        var targetScale = new THREE.Vector3(2.0, 2.0, 1);
        var duration = 600;
        var startTime = performance.now();

        var animateZoom = function () {
            if (mesh.userData._disposed) { self.animatingCard = null; return; }
            var now = performance.now();
            var t = Math.min(1, (now - startTime) / duration);
            var ease = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

            mesh.position.lerpVectors(startPos, targetPos, ease);
            mesh.rotation.x = startRot.x * (1 - ease);
            mesh.rotation.y = startRot.y * (1 - ease);
            mesh.rotation.z = startRot.z * (1 - ease);
            mesh.scale.lerpVectors(startScale, targetScale, ease);

            if (t < 1) {
                requestAnimationFrame(animateZoom);
            } else {
                self.openHandler(mesh.userData.wish);
                self._returnCard(mesh, startPos, startRot, startScale);
            }
        };

        requestAnimationFrame(animateZoom);
    }

    _returnCard(mesh, pos, rot, scale) {
        var self = this;
        var duration = 400;
        var startTime = performance.now();
        var fromPos = mesh.position.clone();
        var fromRot = mesh.rotation.clone();
        var fromScale = mesh.scale.clone();

        var animateReturn = function () {
            if (mesh.userData._disposed) { self.animatingCard = null; return; }
            var now = performance.now();
            var t = Math.min(1, (now - startTime) / duration);
            var ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

            mesh.position.lerpVectors(fromPos, pos, ease);
            mesh.rotation.x = fromRot.x + (rot.x - fromRot.x) * ease;
            mesh.rotation.y = fromRot.y + (rot.y - fromRot.y) * ease;
            mesh.rotation.z = fromRot.z + (rot.z - fromRot.z) * ease;
            mesh.scale.lerpVectors(fromScale, scale, ease);

            if (t < 1) {
                requestAnimationFrame(animateReturn);
            } else {
                self.animatingCard = null;
            }
        };

        setTimeout(function () {
            requestAnimationFrame(animateReturn);
        }, 200);
    }

    render(wishes) {
        this._clear();
        if (!wishes || !wishes.length) return;
        this._bindEvents();

        var count = wishes.length;
        var themes = WD.Config.CARD_THEMES;

        // Card dimensions (world units) - big enough to read
        var cardW = WD.runtime.isMobile ? 60 : 80;
        var cardH = WD.runtime.isMobile ? 78 : 104;

        // Grid layout - all cards face camera, spread in front of it
        var cols = Math.max(2, Math.ceil(Math.sqrt(count * 1.3)));
        var gapX = cardW * 1.4;
        var gapY = cardH * 1.2;

        for (var i = 0; i < count; i++) {
            var wish = wishes[i];
            var themeColor = themes[Math.floor(i / Math.max(1, Math.ceil(count / themes.length))) % themes.length];
            var mesh = this._createCard(wish, i, cardW, cardH, themeColor);

            var col = i % cols;
            var row = Math.floor(i / cols);
            var totalRows = Math.ceil(count / cols);

            // Center the grid
            var x = (col - (cols - 1) / 2) * gapX + WD.Utils.random(-8, 8);
            var y = ((totalRows - 1) / 2 - row) * gapY + WD.Utils.random(-8, 8);
            var z = WD.Utils.random(-30, 30);

            mesh.position.set(x, y, z);
            mesh.rotation.set(
                (Math.random() - 0.5) * 0.06,
                (Math.random() - 0.5) * 0.06,
                (Math.random() - 0.5) * 0.03
            );

            this.basePositions.push(new THREE.Vector3(x, y, z));
            this.floatOffsets.push({
                px: Math.random() * Math.PI * 2,
                py: Math.random() * Math.PI * 2,
                pz: Math.random() * Math.PI * 2,
                sx: 0.2 + Math.random() * 0.2,
                sy: 0.3 + Math.random() * 0.2,
                sz: 0.15 + Math.random() * 0.15,
                ax: 2 + Math.random() * 3,
                ay: 3 + Math.random() * 4,
                az: 1.5 + Math.random() * 2
            });

            this.group.add(mesh);
            this.cardMeshes.push(mesh);
            this.cardData.push(wish);
        }
    }

    _createCard(wish, index, cardW, cardH, themeColor) {
        var cw = 560;
        var ch = 760;
        var canvas = document.createElement("canvas");
        canvas.width = cw;
        canvas.height = ch;
        var ctx = canvas.getContext("2d");
        var tc = themeColor || "#FF6B9D";

        // Background gradient
        var bgGrd = ctx.createLinearGradient(0, 0, 0, ch);
        bgGrd.addColorStop(0, "#1a0a2e");
        bgGrd.addColorStop(0.5, "#2d1b4e");
        bgGrd.addColorStop(1, "#1a0a2e");
        this._roundRect(ctx, 0, 0, cw, ch, 24);
        ctx.fillStyle = bgGrd;
        ctx.fill();

        // Glowing border
        ctx.save();
        ctx.shadowColor = tc;
        ctx.shadowBlur = 20;
        ctx.strokeStyle = tc;
        ctx.lineWidth = 3;
        this._roundRect(ctx, 4, 4, cw - 8, ch - 8, 20);
        ctx.stroke();
        ctx.restore();

        // Inner subtle border
        ctx.strokeStyle = "rgba(255,255,255,0.1)";
        ctx.lineWidth = 1;
        this._roundRect(ctx, 10, 10, cw - 20, ch - 20, 16);
        ctx.stroke();

        ctx.textAlign = "center";

        // Heart icon (drawn as bezier path)
        ctx.save();
        ctx.translate(cw / 2, 110);
        ctx.scale(2.2, 2.2);
        ctx.fillStyle = tc;
        ctx.beginPath();
        ctx.moveTo(0, -8);
        ctx.bezierCurveTo(-15, -25, -30, -5, 0, 15);
        ctx.moveTo(0, -8);
        ctx.bezierCurveTo(15, -25, 30, -5, 0, 15);
        ctx.fill();
        ctx.restore();

        // Card number
        ctx.font = "bold 28px 'Arial Black', Impact, sans-serif";
        ctx.fillStyle = tc;
        ctx.textAlign = "right";
        ctx.fillText("#" + (index + 1), cw - 30, 50);
        ctx.textAlign = "center";

        // Recipient name
        var nameSize = 44;
        ctx.font = "bold " + nameSize + "px Georgia, 'Playfair Display', serif";
        ctx.fillStyle = "#FFFFFF";
        var nameText = wish.to || "Người phụ nữ tuyệt vời";
        while (ctx.measureText(nameText).width > cw - 80 && nameSize > 24) {
            nameSize -= 2;
            ctx.font = "bold " + nameSize + "px Georgia, 'Playfair Display', serif";
        }
        this._wrapText(ctx, nameText, cw / 2, 240, cw - 80, nameSize + 8);

        // Divider
        var divGrd = ctx.createLinearGradient(60, 0, cw - 60, 0);
        divGrd.addColorStop(0, "transparent");
        divGrd.addColorStop(0.5, tc);
        divGrd.addColorStop(1, "transparent");
        ctx.strokeStyle = divGrd;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(60, 340);
        ctx.lineTo(cw - 60, 340);
        ctx.stroke();

        // "Gửi từ:"
        ctx.font = "italic 26px Georgia, 'Lora', serif";
        ctx.fillStyle = "#FFB3D1";
        ctx.fillText("Gửi từ: " + (wish.from || "Ẩn danh"), cw / 2, 400);

        // Message preview
        ctx.font = "22px Georgia, 'Lora', serif";
        ctx.fillStyle = "#AAAAAA";
        var preview = String(wish.message || "").substring(0, 60);
        if ((wish.message || "").length > 60) preview += "...";
        this._wrapText(ctx, preview, cw / 2, 470, cw - 80, 30);

        // Button
        var btnW = 220, btnH = 56;
        var btnX = (cw - btnW) / 2, btnY = ch - 130;
        this._roundRect(ctx, btnX, btnY, btnW, btnH, btnH / 2);
        ctx.save();
        ctx.shadowColor = tc;
        ctx.shadowBlur = 15;
        var btnGrd = ctx.createLinearGradient(btnX, btnY, btnX + btnW, btnY + btnH);
        btnGrd.addColorStop(0, tc);
        btnGrd.addColorStop(1, this._adjustBrightness(tc, -30));
        ctx.fillStyle = btnGrd;
        ctx.fill();
        ctx.restore();

        ctx.font = "bold 22px Georgia, 'Lora', serif";
        ctx.fillStyle = "#FFFFFF";
        ctx.fillText("Nhấn để đọc thư", cw / 2, btnY + btnH / 2 + 8);

        var texture = new THREE.CanvasTexture(canvas);
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;

        var geometry = new THREE.PlaneGeometry(cardW, cardH);
        var material = new THREE.MeshBasicMaterial({
            map: texture,
            transparent: true,
            side: THREE.DoubleSide,
            depthWrite: false
        });

        var mesh = new THREE.Mesh(geometry, material);
        mesh.userData = { index: index, wish: wish };
        return mesh;
    }

    _adjustBrightness(hex, amount) {
        var r = Math.max(0, Math.min(255, parseInt(hex.slice(1, 3), 16) + amount));
        var g = Math.max(0, Math.min(255, parseInt(hex.slice(3, 5), 16) + amount));
        var b = Math.max(0, Math.min(255, parseInt(hex.slice(5, 7), 16) + amount));
        return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
    }

    _roundRect(ctx, x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        ctx.lineTo(x + w, y + h - r);
        ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        ctx.lineTo(x + r, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - r);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath();
    }

    _wrapText(ctx, text, x, y, maxWidth, lineHeight) {
        var words = text.split(/\s+/);
        var line = "";
        for (var i = 0; i < words.length; i++) {
            var test = line + words[i] + " ";
            if (ctx.measureText(test).width > maxWidth && line !== "") {
                ctx.fillText(line.trim(), x, y);
                line = words[i] + " ";
                y += lineHeight;
            } else {
                line = test;
            }
        }
        ctx.fillText(line.trim(), x, y);
    }

    update(dt, elapsed) {
        for (var i = 0; i < this.cardMeshes.length; i++) {
            var mesh = this.cardMeshes[i];
            if (mesh === this.animatingCard) continue;
            var o = this.floatOffsets[i];
            var bp = this.basePositions[i];
            mesh.position.x = bp.x + Math.sin(elapsed * o.sx + o.px) * o.ax;
            mesh.position.y = bp.y + Math.sin(elapsed * o.sy + o.py) * o.ay;
            mesh.position.z = bp.z + Math.sin(elapsed * o.sz + o.pz) * o.az;
        }
    }

    _clear() {
        this.animatingCard = null;
        var self = this;
        this.cardMeshes.forEach(function (mesh) {
            self.group.remove(mesh);
            mesh.geometry.dispose();
            if (mesh.material.map) mesh.material.map.dispose();
            mesh.material.dispose();
            mesh.userData._disposed = true;
        });
        this.cardMeshes = [];
        this.cardData = [];
        this.floatOffsets = [];
        this.basePositions = [];
    }

    dispose() {
        this._clear();
        if (this.world.renderer && this._onClick) {
            var canvas = this.world.renderer.domElement;
            canvas.removeEventListener("click", this._onClick);
            canvas.removeEventListener("touchend", this._onTouchEnd);
        }
        this.world.scene.remove(this.group);
    }
};
