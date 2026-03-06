window.WD = window.WD || {};

WD.Gallery3D = class Gallery3D {
    constructor(world, openHandler) {
        this.world = world;
        this.openHandler = openHandler;
        this.cards = [];
        this.wishes = [];
        this._wishQueue = [];
        this.group = new THREE.Group();
        this.world.scene.add(this.group);

        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
        this._bound = false;
        this._hoverDirty = false;
        this._hoverFrame = 0;

        this.isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
        this._touchStartX = 0;
        this._touchStartY = 0;
        this._touchStartTime = 0;

        var mobile = WD.runtime.isMobile;
        var lowEnd = WD.runtime.isLowEnd;
        this.CARD_W = mobile ? 92 : 100;
        this.CARD_H = mobile ? 122 : 135;
        this.MAX_ACTIVE = lowEnd ? (mobile ? 3 : 5) : (mobile ? 4 : 12);
        this.SPAWN_INTERVAL = lowEnd ? (mobile ? 1.15 : 0.7) : (mobile ? 0.95 : 0.4);
        this._spawnTimer = 0;

        // Lane system to prevent overlap
        this._lanes = [];
        this._laneCount = mobile ? 3 : 6;

        this._viewW = 0;
        this._viewH = 0;

        // Shared geometry (reused by all cards)
        this._sharedGeo = new THREE.PlaneGeometry(this.CARD_W, this.CARD_H);

        // Lighting — simplified on mobile
        this.ambientLight = new THREE.AmbientLight(0x8080cc, mobile ? 0.6 : 0.5);
        this.world.scene.add(this.ambientLight);
        this.dirLight = new THREE.DirectionalLight(0xc0b0ff, 1.0);
        this.dirLight.position.set(200, 150, 200);
        this.world.scene.add(this.dirLight);
        this.accentLight = new THREE.PointLight(0xff66aa, 0.5, 600);
        this.accentLight.position.set(-150, 100, 100);
        this.world.scene.add(this.accentLight);
        // Skip warm light on low-end
        this.warmLight = null;
        if (!lowEnd) {
            this.warmLight = new THREE.PointLight(0xffaa77, 0.25, 500);
            this.warmLight.position.set(100, -80, 150);
            this.world.scene.add(this.warmLight);
        }

        this._hintEl = null;
        this._hintTimeout = null;
        this._texCache = [];
    }

    _bindEvents() {
        if (this._bound) return;
        this._bound = true;
        var self = this;
        var canvas = this.world.renderer.domElement;

        this._onTouchStart = function (e) {
            if (e.touches.length === 1) {
                var t = e.touches[0];
                self._touchStartX = t.clientX;
                self._touchStartY = t.clientY;
                self._touchStartTime = performance.now();
            }
        };
        this._onTouchEnd = function (e) {
            if (e.changedTouches.length > 0) {
                var ct = e.changedTouches[0];
                var dx = Math.abs(ct.clientX - self._touchStartX);
                var dy = Math.abs(ct.clientY - self._touchStartY);
                if (dx < 14 && dy < 14 && performance.now() - self._touchStartTime < 300) {
                    self.mouse.x = (ct.clientX / window.innerWidth) * 2 - 1;
                    self.mouse.y = -(ct.clientY / window.innerHeight) * 2 + 1;
                    self._cast();
                }
            }
        };
        canvas.addEventListener("touchstart", this._onTouchStart, { passive: true });
        canvas.addEventListener("touchend", this._onTouchEnd, { passive: true });

        if (!this.isTouchDevice) {
            this._onClick = function (e) {
                self.mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
                self.mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
                self._cast();
            };
            this._onMouseMove = function (e) {
                self.mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
                self.mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
                self._hoverDirty = true;
            };
            canvas.addEventListener("click", this._onClick);
            canvas.addEventListener("mousemove", this._onMouseMove);
        }
    }

    _cast() {
        this.raycaster.setFromCamera(this.mouse, this.world.camera);
        var meshes = [];
        for (var i = 0; i < this.cards.length; i++) meshes.push(this.cards[i].mesh);
        var hits = this.raycaster.intersectObjects(meshes);
        if (hits.length > 0) {
            var card = this._cardByMesh(hits[0].object);
            if (card && card.wish) {
                this._flashCard(card);
                this.openHandler(card.wish);
            }
        }
    }

    _cardByMesh(mesh) {
        for (var i = 0; i < this.cards.length; i++) {
            if (this.cards[i].mesh === mesh) return this.cards[i];
        }
        return null;
    }

    _flashCard(card) {
        if (!card.mesh) return;
        card.mesh.material.emissiveIntensity = 0.7;
        card._flashTimer = 0.3;
    }

    // ── Render ────────────────────────────────────────────────────────────

    render(wishes) {
        this._clear();
        if (!wishes || !wishes.length) return;
        this.wishes = wishes;
        this._bindEvents();

        var mobile = WD.runtime.isMobile;
        var camZ = mobile ? 380 : 420;
        this.world.camera.position.set(0, 0, camZ);
        this.world.targetZ = camZ;

        var vFov = 60 * Math.PI / 180;
        this._viewH = 2 * Math.tan(vFov / 2) * camZ;
        this._viewW = this._viewH * (window.innerWidth / window.innerHeight);

        // Init lanes
        this._lanes = [];
        var laneW = this._viewW * 0.84 / this._laneCount;
        var laneStartX = -this._viewW * 0.42;
        for (var l = 0; l < this._laneCount; l++) {
            this._lanes.push({
                centerX: laneStartX + laneW * (l + 0.5),
                lastSpawnTime: -999
            });
        }

        var accentColors = ["#ff66aa", "#cc55ff", "#66aaff", "#ff88cc", "#aa88ff",
                            "#ff77bb", "#bb66ee", "#77bbff", "#ffaa99", "#99ccff"];

        // Pre-build textures
        this._texCache = [];
        for (var i = 0; i < wishes.length; i++) {
            this._texCache.push(this._buildTexture(wishes[i], i, accentColors[i % accentColors.length]));
        }

        this._wishQueue = [];
        this._refillQueue();

        // Spawn initial batch
        var initCount = Math.min(this.MAX_ACTIVE, wishes.length, mobile ? 2 : this.MAX_ACTIVE);
        for (var j = 0; j < initCount; j++) {
            this._spawnCard(j * (mobile ? 0.32 : 0.15));
        }

        this._showHint();
    }

    _refillQueue() {
        var indices = [];
        for (var i = 0; i < this.wishes.length; i++) indices.push(i);
        for (var k = indices.length - 1; k > 0; k--) {
            var j = Math.floor(Math.random() * (k + 1));
            var tmp = indices[k];
            indices[k] = indices[j];
            indices[j] = tmp;
        }
        this._wishQueue = this._wishQueue.concat(indices);
    }

    _nextWishIndex() {
        if (this._wishQueue.length === 0) this._refillQueue();
        return this._wishQueue.shift();
    }

    _pickLane(now) {
        // Pick the lane that was used least recently, with slight randomness
        var best = -1;
        var bestTime = Infinity;
        // Shuffle candidates to add variety when multiple lanes are equally old
        var order = [];
        for (var i = 0; i < this._laneCount; i++) order.push(i);
        for (var k = order.length - 1; k > 0; k--) {
            var j = Math.floor(Math.random() * (k + 1));
            var tmp = order[k]; order[k] = order[j]; order[j] = tmp;
        }
        for (var m = 0; m < order.length; m++) {
            var li = order[m];
            if (this._lanes[li].lastSpawnTime < bestTime) {
                bestTime = this._lanes[li].lastSpawnTime;
                best = li;
            }
        }
        return best;
    }

    _spawnCard(startOffset) {
        var idx = this._nextWishIndex();
        var cached = this._texCache[idx];
        var U = WD.Utils;
        var vh = this._viewH;
        var now = performance.now() / 1000;

        // Pick lane
        var laneIdx = this._pickLane(now);
        var lane = this._lanes[laneIdx];
        lane.lastSpawnTime = now;

        // X position: lane center + small jitter
        var jitter = (this._viewW * 0.84 / this._laneCount) * 0.3;
        var x = lane.centerX + U.random(-jitter, jitter);
        var y = vh / 2 + this.CARD_H + U.random(10, 60);

        // Depth layers: front, mid, back — affects z, size, speed, opacity
        var depthRand = Math.random();
        var layer; // 0=back, 1=mid, 2=front
        if (depthRand < 0.25) layer = 0;
        else if (depthRand < 0.65) layer = 1;
        else layer = 2;

        var zByLayer = [U.random(30, 60), U.random(-10, 10), U.random(-50, -25)];
        var scaleByLayer = [0.7, 1.0, 1.15];
        var speedByLayer = [U.random(11, 17), U.random(17, 26), U.random(24, 34)];
        var alphaByLayer = [0.55, 0.85, 1.0];

        var z = zByLayer[layer];
        var scale = scaleByLayer[layer];
        var fallSpeed = speedByLayer[layer] * (WD.runtime.isMobile ? 0.82 : 1);
        var maxAlpha = alphaByLayer[layer];

        var material = new THREE.MeshStandardMaterial({
            map: cached.texture,
            transparent: true,
            opacity: 0,
            side: THREE.DoubleSide,
            roughness: 0.35,
            metalness: 0.15,
            emissive: new THREE.Color(cached.accent),
            emissiveIntensity: 0.1
        });

        var mesh = new THREE.Mesh(this._sharedGeo, material);
        mesh.position.set(x, y, z);
        mesh.scale.setScalar(scale);
        mesh.rotation.set(
            U.random(-0.08, 0.08),
            U.random(-0.12, 0.12),
            U.random(-0.18, 0.18)
        );

        var card = {
            mesh: mesh,
            wish: this.wishes[idx],
            wishIdx: idx,
            age: -(startOffset || 0),
            fallSpeed: fallSpeed,
            maxAlpha: maxAlpha,
            layer: layer,
            // Sway
            swayAmp: U.random(7, 20) * (layer === 0 ? 0.6 : 1),
            swayFreq: U.random(0.24, 0.5),
            swayPhase: U.random(0, Math.PI * 2),
            startX: x,
            // Rotation drift
            rotDriftZ: U.random(-0.08, 0.08),
            rotDriftY: U.random(-0.04, 0.04),
            // Flash
            _flashTimer: 0
        };

        this.group.add(mesh);
        this.cards.push(card);
    }

    // ── Pre-build texture ────────────────────────────────────────────────

    _buildTexture(wish, index, accent) {
        var texW = 256;
        var texH = 320;
        var canvas = document.createElement("canvas");
        canvas.width = texW;
        canvas.height = texH;
        var ctx = canvas.getContext("2d");

        this._drawCardTexture(ctx, texW, texH, wish, index, accent);

        var texture = new THREE.CanvasTexture(canvas);
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.generateMipmaps = false; // perf: skip mipmap

        return { texture: texture, canvas: canvas, accent: accent };
    }

    _drawCardTexture(ctx, W, H, wish, index, accent) {
        var r = 14;

        // Clear with transparency
        ctx.clearRect(0, 0, W, H);

        // Drop shadow
        ctx.save();
        ctx.globalAlpha = 0.25;
        ctx.fillStyle = "#000000";
        ctx.filter = "blur(4px)";
        this._roundRect(ctx, 6, 7, W - 12, H - 12, r);
        ctx.fill();
        ctx.filter = "none";
        ctx.restore();

        // Card background
        ctx.save();
        var bgGrd = ctx.createLinearGradient(0, 0, W * 0.3, H);
        bgGrd.addColorStop(0, "rgba(40, 22, 80, 0.94)");
        bgGrd.addColorStop(0.4, "rgba(22, 14, 58, 0.92)");
        bgGrd.addColorStop(1, "rgba(14, 8, 38, 0.90)");
        this._roundRect(ctx, 3, 3, W - 6, H - 6, r);
        ctx.fillStyle = bgGrd;
        ctx.fill();

        // Top bevel highlight
        ctx.globalAlpha = 0.18;
        var topGrd = ctx.createLinearGradient(0, 3, 0, 35);
        topGrd.addColorStop(0, "rgba(255, 255, 255, 0.5)");
        topGrd.addColorStop(1, "transparent");
        ctx.fillStyle = topGrd;
        this._roundRect(ctx, 3, 3, W - 6, 32, r);
        ctx.fill();
        ctx.globalAlpha = 1.0;

        // Glass shine diagonal
        ctx.globalAlpha = 0.04;
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.moveTo(W * 0.15, 3);
        ctx.lineTo(W * 0.55, 3);
        ctx.lineTo(W * 0.1, H * 0.55);
        ctx.lineTo(3, H * 0.45);
        ctx.closePath();
        ctx.fill();
        ctx.globalAlpha = 1.0;

        // Bottom depth
        ctx.globalAlpha = 0.2;
        var btmGrd = ctx.createLinearGradient(0, H - 20, 0, H - 3);
        btmGrd.addColorStop(0, "transparent");
        btmGrd.addColorStop(1, "rgba(0,0,0,0.35)");
        ctx.fillStyle = btmGrd;
        this._roundRect(ctx, 3, H - 20, W - 6, 17, r);
        ctx.fill();
        ctx.globalAlpha = 1.0;

        // Glowing border
        ctx.strokeStyle = accent;
        ctx.lineWidth = 1.5;
        ctx.globalAlpha = 0.5;
        this._roundRect(ctx, 3, 3, W - 6, H - 6, r);
        ctx.stroke();
        // Outer glow
        ctx.globalAlpha = 0.08;
        ctx.lineWidth = 5;
        this._roundRect(ctx, 3, 3, W - 6, H - 6, r);
        ctx.stroke();
        ctx.globalAlpha = 1.0;
        ctx.restore();

        // ── Corner accent dots ──
        ctx.save();
        ctx.globalAlpha = 0.35;
        ctx.fillStyle = accent;
        var dotR = 2.5;
        ctx.beginPath(); ctx.arc(14, 14, dotR, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(W - 14, 14, dotR, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(14, H - 14, dotR, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(W - 14, H - 14, dotR, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1.0;
        ctx.restore();

        // Icon badge
        var badgeR = 15;
        var badgeX = 25;
        var badgeY = 30;
        ctx.save();
        ctx.globalAlpha = 0.25;
        var glowGrd = ctx.createRadialGradient(badgeX, badgeY, 0, badgeX, badgeY, badgeR + 12);
        glowGrd.addColorStop(0, accent);
        glowGrd.addColorStop(1, "transparent");
        ctx.fillStyle = glowGrd;
        ctx.beginPath();
        ctx.arc(badgeX, badgeY, badgeR + 12, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 0.75;
        ctx.fillStyle = accent;
        ctx.beginPath();
        ctx.arc(badgeX, badgeY, badgeR, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1.0;
        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 15px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        var icons = ["\u2665", "\u2726", "\u2606", "\u2734", "\u2764"];
        ctx.fillText(icons[index % icons.length], badgeX, badgeY + 1);
        ctx.restore();

        // Header
        ctx.save();
        ctx.font = "bold 14px 'Segoe UI', Arial, sans-serif";
        ctx.fillStyle = "#ffffff";
        ctx.globalAlpha = 0.92;
        ctx.textAlign = "left";
        ctx.fillText("Gui " + (wish.to || "em").substring(0, 13) + "...", badgeX + badgeR + 8, 34);
        ctx.globalAlpha = 1.0;
        ctx.restore();

        // Date
        ctx.save();
        ctx.font = "9px 'Segoe UI', sans-serif";
        ctx.fillStyle = accent;
        ctx.globalAlpha = 0.45;
        ctx.textAlign = "right";
        ctx.fillText("8/3/2025", W - 12, 20);
        ctx.globalAlpha = 1.0;
        ctx.restore();

        // Body
        ctx.save();
        ctx.font = "11.5px 'Segoe UI', Arial, sans-serif";
        ctx.fillStyle = "#cebde5";
        ctx.textAlign = "left";
        var preview = String(wish.message || "").substring(0, 140);
        if ((wish.message || "").length > 140) preview += "...";
        this._wrapTextLeft(ctx, preview, 14, 62, W - 28, 16, 8);
        ctx.restore();

        // Divider
        ctx.save();
        ctx.globalAlpha = 0.2;
        var divGrd = ctx.createLinearGradient(14, 0, W - 14, 0);
        divGrd.addColorStop(0, "transparent");
        divGrd.addColorStop(0.2, accent);
        divGrd.addColorStop(0.8, accent);
        divGrd.addColorStop(1, "transparent");
        ctx.strokeStyle = divGrd;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(14, H - 40);
        ctx.lineTo(W - 14, H - 40);
        ctx.stroke();
        ctx.globalAlpha = 1.0;
        ctx.restore();

        // Signature
        ctx.save();
        ctx.font = "italic 10.5px 'Segoe UI', sans-serif";
        ctx.fillStyle = "#ffaacc";
        ctx.globalAlpha = 0.65;
        ctx.textAlign = "right";
        var sig = "-- " + (wish.from || "An danh");
        if (sig.length > 20) sig = sig.substring(0, 20) + "...";
        ctx.fillText(sig, W - 14, H - 18);
        ctx.globalAlpha = 1.0;
        ctx.restore();

        // Card number
        ctx.save();
        ctx.font = "bold 9px 'Segoe UI', sans-serif";
        ctx.fillStyle = accent;
        ctx.globalAlpha = 0.25;
        ctx.textAlign = "left";
        ctx.fillText("#" + (index + 1), 14, H - 18);
        ctx.globalAlpha = 1.0;
        ctx.restore();
    }

    // ── Hint ──────────────────────────────────────────────────────────────

    _showHint() {
        if (this._hintEl) return;
        var hint = document.createElement("div");
        hint.id = "sphere-hint";
        var text = this.isTouchDevice
            ? "Cham vao thu dang roi de doc \uD83D\uDCEC"
            : "Nhan vao thu dang roi de doc \uD83D\uDCEC";
        hint.textContent = text;
        hint.style.cssText = "position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:20;font:13px 'Segoe UI',sans-serif;color:rgba(200,170,255,0.7);pointer-events:none;transition:opacity 1s ease;opacity:1;text-align:center;white-space:nowrap;text-shadow:0 0 8px rgba(180,100,255,0.5),0 0 20px rgba(255,100,200,0.2);letter-spacing:0.5px";
        document.body.appendChild(hint);
        this._hintEl = hint;
        this._hintTimeout = setTimeout(function () { hint.style.opacity = "0"; }, 5000);
        setTimeout(function () { if (hint.parentNode) hint.parentNode.removeChild(hint); }, 6200);
    }

    // ── Update ────────────────────────────────────────────────────────────

    update(dt, elapsed) {
        var vh = this._viewH;
        var fadeZone = 100;
        var despawnY = -vh / 2 - this.CARD_H * 0.5;

        // Throttled hover raycast (every 3 frames, desktop only)
        if (this._hoverDirty && !this.isTouchDevice) {
            this._hoverFrame++;
            if (this._hoverFrame >= 3) {
                this._hoverFrame = 0;
                this._hoverDirty = false;
                this.raycaster.setFromCamera(this.mouse, this.world.camera);
                var meshes = [];
                for (var h = 0; h < this.cards.length; h++) meshes.push(this.cards[h].mesh);
                var hits = this.raycaster.intersectObjects(meshes);
                this.world.renderer.domElement.style.cursor = hits.length > 0 ? 'pointer' : 'default';
            }
        }

        // Spawn
        this._spawnTimer += dt;
        if (this._spawnTimer >= this.SPAWN_INTERVAL && this.cards.length < this.MAX_ACTIVE) {
            this._spawnCard(0);
            this._spawnTimer = 0;
        }

        // Update cards
        for (var i = this.cards.length - 1; i >= 0; i--) {
            var c = this.cards[i];
            c.age += dt;

            if (c.age < 0) {
                c.mesh.visible = false;
                continue;
            }
            c.mesh.visible = true;

            // Flash decay
            if (c._flashTimer > 0) {
                c._flashTimer -= dt;
                if (c._flashTimer <= 0) {
                    c.mesh.material.emissiveIntensity = 0.1;
                }
            }

            // Fade in (quick)
            var alpha = c.maxAlpha;
            if (c.age < 0.6) {
                alpha = c.maxAlpha * (c.age / 0.6);
            }

            // Fall
            c.mesh.position.y -= c.fallSpeed * dt;

            // Smooth sway
            var t = c.age;
            c.mesh.position.x = c.startX + Math.sin(t * c.swayFreq + c.swayPhase) * c.swayAmp;

            // Gentle rotation drift
            c.mesh.rotation.z += c.rotDriftZ * dt;
            c.mesh.rotation.y += c.rotDriftY * dt;

            // Fade out near bottom
            var distFromBottom = c.mesh.position.y - despawnY;
            if (distFromBottom < fadeZone) {
                alpha *= Math.max(0, distFromBottom / fadeZone);
            }

            c.mesh.material.opacity = alpha;

            // Remove
            if (c.mesh.position.y < despawnY) {
                this.group.remove(c.mesh);
                // Don't dispose shared geometry
                c.mesh.material.dispose();
                this.cards.splice(i, 1);
            }
        }
    }

    // ── Helpers ───────────────────────────────────────────────────────────

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

    _wrapTextLeft(ctx, text, x, y, maxWidth, lineHeight, maxLines) {
        var words = text.split(/\s+/);
        var line = "";
        var lineCount = 0;
        for (var i = 0; i < words.length; i++) {
            var test = line + words[i] + " ";
            if (ctx.measureText(test).width > maxWidth && line !== "") {
                lineCount++;
                if (maxLines && lineCount >= maxLines) {
                    ctx.fillText(line.trim() + "...", x, y);
                    return;
                }
                ctx.fillText(line.trim(), x, y);
                line = words[i] + " ";
                y += lineHeight;
            } else {
                line = test;
            }
        }
        ctx.fillText(line.trim(), x, y);
    }

    // ── Cleanup ──────────────────────────────────────────────────────────

    _clear() {
        for (var i = 0; i < this.cards.length; i++) {
            var c = this.cards[i];
            this.group.remove(c.mesh);
            c.mesh.material.dispose();
        }
        this.cards = [];
        this.wishes = [];
        this._wishQueue = [];
        for (var j = 0; j < this._texCache.length; j++) {
            if (this._texCache[j].texture) this._texCache[j].texture.dispose();
        }
        this._texCache = [];
    }

    dispose() {
        this._clear();
        if (this._sharedGeo) { this._sharedGeo.dispose(); this._sharedGeo = null; }
        if (this._hintEl && this._hintEl.parentNode) this._hintEl.parentNode.removeChild(this._hintEl);
        if (this._hintTimeout) clearTimeout(this._hintTimeout);
        if (this.world.scene) {
            this.world.scene.remove(this.ambientLight);
            this.world.scene.remove(this.dirLight);
            this.world.scene.remove(this.accentLight);
            if (this.warmLight) this.world.scene.remove(this.warmLight);
            this.world.scene.remove(this.group);
        }
        if (this.world.renderer) {
            var canvas = this.world.renderer.domElement;
            if (this._onTouchStart) {
                canvas.removeEventListener("touchstart", this._onTouchStart);
                canvas.removeEventListener("touchend", this._onTouchEnd);
            }
            if (this._onClick) canvas.removeEventListener("click", this._onClick);
            if (this._onMouseMove) canvas.removeEventListener("mousemove", this._onMouseMove);
        }
    }
};
