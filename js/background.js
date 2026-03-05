window.WD = window.WD || {};

WD.ThreeBackground = class ThreeBackground {
    constructor(world) {
        this.world = world;
        this.group = new THREE.Group();
        this.world.scene.add(this.group);
        this.uniforms = {
            uTime: { value: 0 },
            uOpacity: { value: 0 }
        };
        this.starPoints = null;
        this.starGeometry = null;
        this.starMaterial = null;
        this.meteors = [];
        this.nextMeteorAt = performance.now() + this._nextDelay();
        this.lastSwipeY = null;
        this.lastTriggerAt = 0;
        this.listeners = [];

        this._createStars();
        this._bindMeteorTriggers();
    }

    _createStars() {
        var count = WD.runtime.isLowEnd ? 1000 : (WD.runtime.isMobile ? 1500 : WD.Config.STAR_COUNT);
        var positions = new Float32Array(count * 3);
        var colors = new Float32Array(count * 3);
        var sizes = new Float32Array(count);
        var offsets = new Float32Array(count);
        var depths = new Float32Array(count); // 0=far/slow, 1=near/fast
        var U = WD.Utils;

        // Store base positions for parallax
        this.starBasePositions = positions.slice();
        this.starDepths = depths;
        this.starCount = count;

        for (var i = 0; i < count; i++) {
            var depth = Math.random(); // 0=far, 1=near
            var radius = U.random(depth < 0.5 ? 1100 : 800, depth < 0.5 ? 1500 : 1000);
            var theta = U.random(0, Math.PI * 2);
            var phi = Math.acos(U.random(-1, 1));
            var base = i * 3;
            positions[base] = radius * Math.sin(phi) * Math.cos(theta);
            positions[base + 1] = radius * Math.sin(phi) * Math.sin(theta);
            positions[base + 2] = radius * Math.cos(phi);
            var color = new THREE.Color(WD.Config.STAR_PALETTE[Math.floor(Math.random() * WD.Config.STAR_PALETTE.length)]);
            colors[base] = color.r;
            colors[base + 1] = color.g;
            colors[base + 2] = color.b;
            // Near stars brighter and bigger
            sizes[i] = depth < 0.5 ? U.random(0.5, 1.5) : U.random(1.5, 3.0);
            offsets[i] = U.random(0, Math.PI * 2);
            depths[i] = depth;
        }
        // Save base positions after filling
        this.starBasePositions = new Float32Array(positions);

        this.starGeometry = new THREE.BufferGeometry();
        this.starGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
        this.starGeometry.setAttribute("aColor", new THREE.BufferAttribute(colors, 3));
        this.starGeometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
        this.starGeometry.setAttribute("aOffset", new THREE.BufferAttribute(offsets, 1));

        this.starMaterial = new THREE.ShaderMaterial({
            uniforms: this.uniforms,
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            vertexShader: [
                "uniform float uTime;",
                "attribute vec3 aColor;",
                "attribute float aSize;",
                "attribute float aOffset;",
                "varying vec3 vColor;",
                "varying float vBlink;",
                "void main() {",
                "  vColor = aColor;",
                "  vBlink = sin(uTime * 1.8 + aOffset) * 0.5 + 0.5;",
                "  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);",
                "  float dist = max(1.0, -mvPosition.z);",
                "  gl_PointSize = aSize * (220.0 / dist);",
                "  gl_Position = projectionMatrix * mvPosition;",
                "}"
            ].join("\n"),
            fragmentShader: [
                "uniform float uOpacity;",
                "varying vec3 vColor;",
                "varying float vBlink;",
                "void main() {",
                "  float d = distance(gl_PointCoord, vec2(0.5));",
                "  float alpha = smoothstep(0.5, 0.0, d);",
                "  alpha *= (0.25 + 0.75 * vBlink) * uOpacity;",
                "  gl_FragColor = vec4(vColor, alpha);",
                "}"
            ].join("\n")
        });

        this.starPoints = new THREE.Points(this.starGeometry, this.starMaterial);
        this.group.add(this.starPoints);
    }

    _nextDelay() {
        return WD.runtime.isMobile ? WD.Utils.random(6000, 15000) : WD.Utils.random(4000, 10000);
    }

    _bindMeteorTriggers() {
        var self = this;
        var trigger = function () { self._triggerMeteor(); };
        var onTouchStart = function (e) {
            if (!e.touches || !e.touches.length) return;
            self.lastSwipeY = e.touches[0].clientY;
        };
        var onTouchMove = function (e) {
            if (!e.touches || !e.touches.length || self.lastSwipeY == null) return;
            var delta = Math.abs(e.touches[0].clientY - self.lastSwipeY);
            if (delta > 16) {
                self._triggerMeteor();
                self.lastSwipeY = e.touches[0].clientY;
            }
        };
        window.addEventListener("scroll", trigger, { passive: true });
        window.addEventListener("touchstart", onTouchStart, { passive: true });
        window.addEventListener("touchmove", onTouchMove, { passive: true });
        this.listeners.push(function () { window.removeEventListener("scroll", trigger); });
        this.listeners.push(function () { window.removeEventListener("touchstart", onTouchStart); });
        this.listeners.push(function () { window.removeEventListener("touchmove", onTouchMove); });
    }

    _triggerMeteor() {
        var now = performance.now();
        if (now - this.lastTriggerAt < 300) return;
        this.lastTriggerAt = now;
        this._spawnMeteor();
        this.nextMeteorAt = now + this._nextDelay();
    }

    _spawnMeteor() {
        var U = WD.Utils;
        var segCount = WD.runtime.isMobile ? 5 : U.randomInt(5, 8);
        var start = new THREE.Vector3(U.random(-850, 280), U.random(280, 780), U.random(-420, 160));
        var dir = new THREE.Vector3(1, -1, 0).normalize();
        var meteor = {
            start: start,
            dir: dir,
            speed: WD.runtime.isMobile ? 620 : 780,
            life: 1.2,
            age: 0,
            length: WD.runtime.isMobile ? 120 : 180,
            segmentLength: WD.runtime.isMobile ? 18 : 24,
            segments: []
        };
        for (var i = 0; i < segCount; i++) {
            var geometry = new THREE.BufferGeometry();
            geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(6), 3));
            var color = new THREE.Color("#fffdf8").lerp(new THREE.Color(WD.Config.COLORS.gold), i / Math.max(1, segCount - 1));
            var material = new THREE.LineBasicMaterial({
                color: color,
                transparent: true,
                opacity: 1 - i * 0.12,
                depthWrite: false,
                blending: THREE.AdditiveBlending
            });
            var line = new THREE.Line(geometry, material);
            this.group.add(line);
            meteor.segments.push({ line: line, geometry: geometry, material: material });
        }
        this.meteors.push(meteor);
    }

    _updateMeteors(dt) {
        for (var i = this.meteors.length - 1; i >= 0; i--) {
            var m = this.meteors[i];
            m.age += dt;
            var progress = m.age / m.life;
            var travel = m.speed * m.age;
            for (var s = 0; s < m.segments.length; s++) {
                var seg = m.segments[s];
                var offset = s * (m.length / m.segments.length);
                var headDist = travel - offset;
                var tailDist = headDist - m.segmentLength;
                var positions = seg.geometry.attributes.position.array;
                positions[0] = m.start.x + m.dir.x * tailDist;
                positions[1] = m.start.y + m.dir.y * tailDist;
                positions[2] = m.start.z + m.dir.z * tailDist;
                positions[3] = m.start.x + m.dir.x * headDist;
                positions[4] = m.start.y + m.dir.y * headDist;
                positions[5] = m.start.z + m.dir.z * headDist;
                seg.geometry.attributes.position.needsUpdate = true;
                var fadeTrail = 1 - (s / m.segments.length) * 0.85;
                seg.material.opacity = Math.max(0, (1 - progress) * fadeTrail);
            }
            var headX = m.start.x + m.dir.x * travel;
            var headY = m.start.y + m.dir.y * travel;
            if (progress >= 1 || headX > 1350 || headY < -1350) this._removeMeteor(i);
        }
    }

    _removeMeteor(index) {
        var m = this.meteors[index];
        if (!m) return;
        var self = this;
        m.segments.forEach(function (seg) {
            self.group.remove(seg.line);
            seg.geometry.dispose();
            seg.material.dispose();
        });
        this.meteors.splice(index, 1);
    }

    update(dt, now) {
        this.uniforms.uTime.value += dt;
        this.uniforms.uOpacity.value += (1 - this.uniforms.uOpacity.value) * 0.03;
        this.group.rotation.y += dt * 0.01;
        if (now >= this.nextMeteorAt) {
            this._spawnMeteor();
            this.nextMeteorAt = now + this._nextDelay();
        }
        this._updateMeteors(dt);
        this._updateParallax();
    }

    _updateParallax() {
        if (!this.starGeometry || !this.starBasePositions) return;
        var cam = this.world.camera;
        var cx = cam.position.x;
        var cy = cam.position.y;
        var posArr = this.starGeometry.attributes.position.array;
        var base = this.starBasePositions;
        var deps = this.starDepths;
        for (var i = 0; i < this.starCount; i++) {
            var d = deps[i];
            // Near stars (d≈1) shift more; far stars (d≈0) shift less
            var shift = d * 18;
            var bi = i * 3;
            posArr[bi]     = base[bi]     - cx * shift * 0.001;
            posArr[bi + 1] = base[bi + 1] - cy * shift * 0.001;
            posArr[bi + 2] = base[bi + 2];
        }
        this.starGeometry.attributes.position.needsUpdate = true;
    }

    dispose() {
        this.listeners.forEach(function (off) { off(); });
        this.listeners = [];
        for (var i = this.meteors.length - 1; i >= 0; i--) this._removeMeteor(i);
        if (this.starPoints) this.group.remove(this.starPoints);
        if (this.starGeometry) this.starGeometry.dispose();
        if (this.starMaterial) this.starMaterial.dispose();
        this.world.scene.remove(this.group);
    }
};
