window.WD = window.WD || {};

WD.ThreeIntro = class ThreeIntro {
    constructor(world, onDone) {
        this.world = world;
        this.onDone = onDone;
        this.active = true;
        this.finished = false;

        this.skipHandler = () => this.finish(true);
        WD.dom.skipIntro.addEventListener("click", this.skipHandler);

        var count = WD.Config.PARTICLE_COUNT;
        this.count = count;

        // Build full sequence: greetings (single) + paired names
        this.sequence = [];
        for (var i = 0; i < WD.Config.INTRO_SEQUENCE.length; i++) {
            this.sequence.push({ type: "single", text: WD.Config.INTRO_SEQUENCE[i] });
        }
        var names = WD.Config.RECIPIENT_NAMES;
        for (var i = 0; i < names.length; i += 2) {
            if (i + 1 < names.length) {
                this.sequence.push({ type: "pair", line1: names[i], line2: names[i + 1] });
            } else {
                this.sequence.push({ type: "single", text: names[i] });
            }
        }

        // Phase state machine
        // BIRTH → GATHER → HOLD → EXPLODE → ... → HEART → HEARTBEAT → HEART_SPIN → HEART_SHATTER → FLOWER → FLOWER_HOLD → FIREWORKS
        this.currentStep = 0;
        this.phase = "BIRTH";
        this.phaseStartTime = performance.now();

        // Heart 3D spin state
        this.heartBaseX = new Float32Array(0);
        this.heartBaseY = new Float32Array(0);
        this.heartBaseZ = new Float32Array(0);
        this.heartRotY = 0;
        this._heartFlashed = false;

        // Flower state
        this.flowerRotation = 0;
        this.flowerTotalRot = 0;
        // Stagger: each particle's petal index (0-4) for delayed bloom
        this.flowerPetalIndex = new Float32Array(0);

        // Sparkle dissolve delay per particle
        this.dissolveDelay = new Float32Array(count);
        this.dissolveSavedSize = new Float32Array(count);

        // Fireworks: wave counter
        this.fireworkWave = 0;
        this.fireworkWaveTimer = 0;

        // Particle arrays
        this.particleX = new Float32Array(count);
        this.particleY = new Float32Array(count);
        this.particleZ = new Float32Array(count);
        this.particleVX = new Float32Array(count);
        this.particleVY = new Float32Array(count);

        this.colorR = new Float32Array(count);
        this.colorG = new Float32Array(count);
        this.colorB = new Float32Array(count);
        this.targetR = new Float32Array(count);
        this.targetG = new Float32Array(count);
        this.targetB = new Float32Array(count);
        this.particleSizes = new Float32Array(count);

        // Initialize particles scattered
        for (var i = 0; i < count; i++) {
            this.particleX[i] = (Math.random() - 0.5) * 800;
            this.particleY[i] = (Math.random() - 0.5) * 600;
            this.particleZ[i] = (Math.random() - 0.5) * 200;
            this.particleVX[i] = 0;
            this.particleVY[i] = 0;
            this.particleSizes[i] = 0;
            this.colorR[i] = 1.0;
            this.colorG[i] = 0.42;
            this.colorB[i] = 0.62;
            this.targetR[i] = this.colorR[i];
            this.targetG[i] = this.colorG[i];
            this.targetB[i] = this.colorB[i];
        }

        this.targets = [];

        // Three.js geometry
        var positions = new Float32Array(count * 3);
        var colors = new Float32Array(count * 3);
        var sizes = new Float32Array(count);
        for (var i = 0; i < count; i++) {
            positions[i * 3] = this.particleX[i];
            positions[i * 3 + 1] = this.particleY[i];
            positions[i * 3 + 2] = this.particleZ[i];
            colors[i * 3] = this.colorR[i];
            colors[i * 3 + 1] = this.colorG[i];
            colors[i * 3 + 2] = this.colorB[i];
            sizes[i] = 0;
        }

        this.geometry = new THREE.BufferGeometry();
        this.geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
        this.geometry.setAttribute("aColor", new THREE.BufferAttribute(colors, 3));
        this.geometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));

        this.uniforms = { uOpacity: { value: 0.0 } };

        this.material = new THREE.ShaderMaterial({
            uniforms: this.uniforms,
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            vertexShader: [
                "attribute vec3 aColor;",
                "attribute float aSize;",
                "varying vec3 vColor;",
                "void main() {",
                "  vColor = aColor;",
                "  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);",
                "  float dist = max(1.0, -mvPosition.z);",
                "  gl_PointSize = aSize * (350.0 / dist);",
                "  gl_Position = projectionMatrix * mvPosition;",
                "}"
            ].join("\n"),
            fragmentShader: [
                "uniform float uOpacity;",
                "varying vec3 vColor;",
                "void main() {",
                "  float d = distance(gl_PointCoord, vec2(0.5));",
                "  float alpha = smoothstep(0.5, 0.05, d);",
                "  alpha *= uOpacity;",
                "  gl_FragColor = vec4(vColor, alpha);",
                "}"
            ].join("\n")
        });

        this.points = new THREE.Points(this.geometry, this.material);
        this.world.scene.add(this.points);
    }

    _hexToRGB(hex) {
        var r = parseInt(hex.slice(1, 3), 16) / 255;
        var g = parseInt(hex.slice(3, 5), 16) / 255;
        var b = parseInt(hex.slice(5, 7), 16) / 255;
        return { r: r, g: g, b: b };
    }

    _lerpColor(hex1, hex2, t) {
        var c1 = this._hexToRGB(hex1);
        var c2 = this._hexToRGB(hex2);
        return {
            r: c1.r + (c2.r - c1.r) * t,
            g: c1.g + (c2.g - c1.g) * t,
            b: c1.b + (c2.b - c1.b) * t
        };
    }

    _loadStep(index) {
        this.currentStep = index;
        var step = this.sequence[index];
        if (step.type === "pair") {
            this.targets = WD.TextSampler.sampleTwoLines(step.line1, step.line2, this.count);
        } else {
            this.targets = WD.TextSampler.sample(step.text, this.count);
        }

        for (var i = 0; i < this.count; i++) {
            if (i < this.targets.length) {
                var ny = (this.targets[i].y + 150) / 300;
                ny = Math.max(0, Math.min(1, ny));
                var color = this._lerpColor("#FF0055", "#FFB3D1", ny);
                this.targetR[i] = color.r;
                this.targetG[i] = color.g;
                this.targetB[i] = color.b;
            } else {
                this.targetR[i] = 1.0;
                this.targetG[i] = 0.42;
                this.targetB[i] = 0.62;
            }
        }

        this.phase = "GATHER";
        this.phaseStartTime = performance.now();
    }

    _loadHeart() {
        var heartPoints = WD.RoseBouquet.getHeartPoints(this.count);
        this.targets = [];
        this.heartBaseX = new Float32Array(this.count);
        this.heartBaseY = new Float32Array(this.count);
        this.heartBaseZ = new Float32Array(this.count);
        for (var i = 0; i < this.count; i++) {
            var hp = heartPoints[i % heartPoints.length];
            this.targets.push({ x: hp.x, y: hp.y, z: hp.z || 0 });
            this.heartBaseX[i] = hp.x;
            this.heartBaseY[i] = hp.y;
            this.heartBaseZ[i] = hp.z || 0;
            var c = this._hexToRGB(hp.color);
            this.targetR[i] = c.r;
            this.targetG[i] = c.g;
            this.targetB[i] = c.b;
        }
        this.heartRotY = 0;
        this.phase = "HEART";
        this.phaseStartTime = performance.now();
    }

    _loadFlower() {
        var flowerPoints = WD.RoseBouquet.getFlowerPoints(this.count);
        this.flowerTargets = [];
        this.flowerPetalIndex = new Float32Array(this.count);
        var PETALS = 5;
        for (var i = 0; i < this.count; i++) {
            var fp = flowerPoints[i % flowerPoints.length];
            this.flowerTargets.push({ x: fp.x, y: fp.y, color: fp.color, size: fp.size || 2.5 });
            var c = this._hexToRGB(fp.color);
            this.targetR[i] = c.r;
            this.targetG[i] = c.g;
            this.targetB[i] = c.b;
            // Assign petal index based on angle from center for stagger
            var ang = Math.atan2(fp.y, fp.x);
            var petalIdx = Math.floor(((ang + Math.PI) / (Math.PI * 2)) * PETALS) % PETALS;
            this.flowerPetalIndex[i] = petalIdx;
        }
        this.flowerRotation = 0;
        this.flowerTotalRot = 0;
        this.phase = "FLOWER";
        this.phaseStartTime = performance.now();
    }

    update(dt) {
        if (!this.active) return;

        var now = performance.now();
        var elapsed = now - this.phaseStartTime;
        var DUR = WD.Config.PHASE_DURATION;
        var cam = this.world.camera;
        var mobile = WD.runtime.isMobile;

        // ── BIRTH (fade-in from nothing) ──────────────────────────────────
        if (this.phase === "BIRTH") {
            var t = Math.min(elapsed / 600, 1);
            var ease = t * t;
            this.uniforms.uOpacity.value = ease * 0.9;
            for (var i = 0; i < this.count; i++) {
                this.particleSizes[i] += (1.0 - this.particleSizes[i]) * 0.06;
                // Gentle expansion from center
                this.particleX[i] *= 1 + dt * 0.3;
                this.particleY[i] *= 1 + dt * 0.3;
            }
            if (elapsed >= 600) {
                this.uniforms.uOpacity.value = 0.9;
                this._loadStep(0);
            }

        // ── GATHER ──────────────────────────────────────────────────────────
        } else if (this.phase === "GATHER") {
            var t = Math.min(elapsed / DUR.GATHER, 1);
            var ease = 1 - Math.pow(1 - t, 3);

            var tLen = this.targets.length;
            for (var i = 0; i < this.count; i++) {
                if (i < tLen) {
                    // Main particles: move toward text target
                    this.particleX[i] += (this.targets[i].x - this.particleX[i]) * ease * 0.22;
                    this.particleY[i] += (this.targets[i].y - this.particleY[i]) * ease * 0.22;
                    this.particleZ[i] += (0 - this.particleZ[i]) * 0.1;
                    this.particleSizes[i] += (4 - this.particleSizes[i]) * 0.08;
                    this.colorR[i] += (this.targetR[i] - this.colorR[i]) * 0.05;
                    this.colorG[i] += (this.targetG[i] - this.colorG[i]) * 0.05;
                    this.colorB[i] += (this.targetB[i] - this.colorB[i]) * 0.05;
                } else {
                    // Trail ghost particles: follow a leader with lag
                    var leader = i % tLen;
                    this.particleX[i] += (this.particleX[leader] - this.particleX[i]) * 0.08;
                    this.particleY[i] += (this.particleY[leader] - this.particleY[i]) * 0.08;
                    this.particleZ[i] += (0 - this.particleZ[i]) * 0.05;
                    this.particleSizes[i] += (2.0 - this.particleSizes[i]) * 0.04;
                    this.colorR[i] = this.colorR[leader] * 0.5;
                    this.colorG[i] = this.colorG[leader] * 0.5;
                    this.colorB[i] = this.colorB[leader] * 0.5;
                }
                // Random sparkle shimmer
                if (Math.random() < 0.003) {
                    this.colorR[i] = 1.0; this.colorG[i] = 1.0; this.colorB[i] = 1.0;
                    this.particleSizes[i] *= 1.5;
                }
            }

            // Camera breath: subtle oscillation while zooming in
            var camTarget = mobile ? 350 : 420;
            var camBreath = Math.sin(elapsed * 0.003) * 5;
            cam.position.z += ((camTarget + camBreath) - cam.position.z) * 0.03;

            if (elapsed >= DUR.GATHER) {
                this.phase = "HOLD";
                this.phaseStartTime = now;
            }

        // ── HOLD (ripple breathing) ──────────────────────────────────────────
        } else if (this.phase === "HOLD") {
            var rippleSpeed = 3.0;
            var rippleAmp = 3.5;
            for (var i = 0; i < this.count; i++) {
                if (i < this.targets.length) {
                    var tx = this.targets[i].x;
                    var ty = this.targets[i].y;
                    var wave = Math.sin(elapsed * 0.001 * rippleSpeed + tx * 0.04) * rippleAmp;
                    this.particleX[i] += (tx - this.particleX[i]) * 0.25;
                    this.particleY[i] += ((ty + wave) - this.particleY[i]) * 0.25;
                    this.particleZ[i] += (0 - this.particleZ[i]) * 0.15;
                }
                var breathe = 4 + Math.sin(elapsed * 0.001 * 2.5) * 1.2;
                this.particleSizes[i] += (breathe - this.particleSizes[i]) * 0.08;
                // Gold shimmer: subtle color shift pink → gold → pink
                var shimmer = Math.sin(elapsed * 0.0015) * 0.5 + 0.5;
                var shimAmt = shimmer * 0.15;
                this.colorR[i] += ((this.targetR[i] * (1 - shimAmt) + 1.0 * shimAmt) - this.colorR[i]) * 0.05;
                this.colorG[i] += ((this.targetG[i] * (1 - shimAmt) + 0.82 * shimAmt) - this.colorG[i]) * 0.05;
                this.colorB[i] += ((this.targetB[i] * (1 - shimAmt) + 0.48 * shimAmt) - this.colorB[i]) * 0.05;
            }

            if (elapsed >= DUR.HOLD) {
                if (this.currentStep >= this.sequence.length - 1) {
                    this._loadHeart();
                } else {
                    // Init sparkle dissolve
                    for (var i = 0; i < this.count; i++) {
                        this.dissolveDelay[i] = Math.random() * 200;
                        this.dissolveSavedSize[i] = this.particleSizes[i];
                        var px = this.particleX[i];
                        var py = this.particleY[i];
                        var dist = Math.sqrt(px * px + py * py) + 0.001;
                        // Gentle outward drift
                        this.particleVX[i] = (px / dist) * 30 + (Math.random() - 0.5) * 20;
                        this.particleVY[i] = (py / dist) * 30 + (Math.random() - 0.5) * 20;
                    }
                    this.phase = "EXPLODE";
                    this.phaseStartTime = now;
                }
            }

        // ── EXPLODE (sparkle dissolve) ─────────────────────────────────────────
        } else if (this.phase === "EXPLODE") {
            for (var i = 0; i < this.count; i++) {
                var myElapsed = elapsed - this.dissolveDelay[i];
                if (myElapsed < 0) continue;

                var t = Math.min(myElapsed / 350, 1);

                if (t < 0.3) {
                    // Flash phase: size grows, color → white
                    var flashT = t / 0.3;
                    this.particleSizes[i] = this.dissolveSavedSize[i] + (8 - this.dissolveSavedSize[i]) * flashT;
                    this.colorR[i] += (1.0 - this.colorR[i]) * 0.15;
                    this.colorG[i] += (1.0 - this.colorG[i]) * 0.15;
                    this.colorB[i] += (1.0 - this.colorB[i]) * 0.15;
                } else {
                    // Fade phase: shrink + dim
                    var fadeT = (t - 0.3) / 0.7;
                    this.particleSizes[i] = 8 * (1 - fadeT) + 0.3 * fadeT;
                    this.colorR[i] *= 0.94;
                    this.colorG[i] *= 0.94;
                    this.colorB[i] *= 0.94;
                }

                // Gentle outward drift
                this.particleX[i] += this.particleVX[i] * dt;
                this.particleY[i] += this.particleVY[i] * dt;
            }

            if (elapsed >= DUR.EXPLODE) {
                // Scatter particles randomly for next GATHER
                for (var i = 0; i < this.count; i++) {
                    this.particleX[i] = (Math.random() - 0.5) * 600;
                    this.particleY[i] = (Math.random() - 0.5) * 400;
                    this.particleZ[i] = (Math.random() - 0.5) * 100;
                    this.particleSizes[i] = 1;
                    this.colorR[i] = 1.0;
                    this.colorG[i] = 0.42;
                    this.colorB[i] = 0.62;
                }
                this._loadStep(this.currentStep + 1);
            }

        // ── HEART (gather into 3D heart) ────────────────────────────────────
        } else if (this.phase === "HEART") {
            var t = Math.min(elapsed / 1600, 1);
            var ease = 1 - Math.pow(1 - t, 3);

            for (var i = 0; i < this.count; i++) {
                if (i < this.targets.length) {
                    this.particleX[i] += (this.targets[i].x - this.particleX[i]) * ease * 0.15;
                    this.particleY[i] += (this.targets[i].y - this.particleY[i]) * ease * 0.15;
                    this.particleZ[i] += (this.targets[i].z - this.particleZ[i]) * ease * 0.15;
                }
                this.particleSizes[i] += (3.5 - this.particleSizes[i]) * 0.06;
                this.colorR[i] += (this.targetR[i] - this.colorR[i]) * 0.04;
                this.colorG[i] += (this.targetG[i] - this.colorG[i]) * 0.04;
                this.colorB[i] += (this.targetB[i] - this.colorB[i]) * 0.04;
            }

            cam.position.z += ((mobile ? 420 : 460) - cam.position.z) * 0.02;

            if (elapsed >= 1800) {
                this.phase = "HEARTBEAT";
                this.phaseStartTime = now;
            }

        // ── HEARTBEAT (2 pulses before spin) ────────────────────────────────
        } else if (this.phase === "HEARTBEAT") {
            // Beat pattern: two quick pulses at t=0.15s and t=0.55s
            var beatT = elapsed * 0.001; // seconds
            // sin² envelope gives 2 beats in ~0.8s
            var pulse = Math.max(0, Math.sin(beatT * Math.PI * 2.5)) * Math.exp(-beatT * 2.0);
            var targetSize = 3.5 + pulse * (mobile ? 3.5 : 5.5);
            // Glow: shift color brighter on beat
            var glowR = Math.min(1, 1.0 + pulse * 0.4);
            var glowG = Math.min(1, 0.42 + pulse * 0.4);
            var glowB = Math.min(1, 0.62 + pulse * 0.4);

            // Camera micro-shake on beat
            var shakeAmt = pulse * (mobile ? 3 : 5);
            cam.position.x = (Math.random() - 0.5) * shakeAmt;

            // Flash screen on first strong beat
            if (!this._heartFlashed && beatT > 0.12 && pulse > 0.3) {
                this._heartFlashed = true;
                this._flashScreen();
            }

            for (var i = 0; i < this.count; i++) {
                // Keep snapped to heart positions
                if (i < this.targets.length) {
                    this.particleX[i] += (this.targets[i].x - this.particleX[i]) * 0.3;
                    this.particleY[i] += (this.targets[i].y - this.particleY[i]) * 0.3;
                    this.particleZ[i] += (this.targets[i].z - this.particleZ[i]) * 0.3;
                }
                this.particleSizes[i] += (targetSize - this.particleSizes[i]) * 0.25;
                // Blend glow color toward target heart color
                this.colorR[i] += (this.targetR[i] * glowR - this.colorR[i]) * 0.12;
                this.colorG[i] += (this.targetG[i] * glowG - this.colorG[i]) * 0.12;
                this.colorB[i] += (this.targetB[i] * glowB - this.colorB[i]) * 0.12;
            }

            cam.position.z += ((mobile ? 420 : 460) - cam.position.z) * 0.02;

            if (elapsed >= 1000) {
                cam.position.x = 0; // reset shake
                this.heartRotY = 0;
                this.phase = "HEART_SPIN";
                this.phaseStartTime = now;
            }

        // ── HEART_SPIN (Y-axis rotation, camera tilts down slightly) ─────────
        } else if (this.phase === "HEART_SPIN") {
            var spinSpeed = mobile ? 1.6 : 2.0;
            this.heartRotY += dt * spinSpeed;

            // Camera tilt: lerp Y from 0 → -30 → 0 over 2 full rotations
            var tiltT = Math.min(this.heartRotY / (Math.PI * 4), 1);
            // Arc: sin(π*t) gives 0→peak→0
            var camTiltY = Math.sin(tiltT * Math.PI) * (mobile ? -20 : -30);
            cam.position.y += (camTiltY - cam.position.y) * 0.03;
            cam.lookAt(0, 0, 0);

            var cosY = Math.cos(this.heartRotY);
            var sinY = Math.sin(this.heartRotY);
            for (var i = 0; i < this.count; i++) {
                var bx = this.heartBaseX[i];
                var by = this.heartBaseY[i];
                var bz = this.heartBaseZ[i];
                var tx = bx * cosY - bz * sinY;
                var tz = bx * sinY + bz * cosY;
                this.particleX[i] += (tx - this.particleX[i]) * 0.18;
                this.particleY[i] += (by - this.particleY[i]) * 0.18;
                this.particleZ[i] += (tz - this.particleZ[i]) * 0.18;
                this.particleSizes[i] += (3.5 - this.particleSizes[i]) * 0.04;
                this.colorR[i] += (this.targetR[i] - this.colorR[i]) * 0.03;
                this.colorG[i] += (this.targetG[i] - this.colorG[i]) * 0.03;
                this.colorB[i] += (this.targetB[i] - this.colorB[i]) * 0.03;
            }

            cam.position.z += ((mobile ? 420 : 460) - cam.position.z) * 0.02;

            if (this.heartRotY >= Math.PI * 4) {
                // Reset camera Y, init shatter
                cam.position.y = 0;
                for (var i = 0; i < this.count; i++) {
                    var angle = Math.random() * Math.PI * 2;
                    var speed = (mobile ? 60 : 100) * (0.3 + Math.random() * 0.7);
                    this.particleVX[i] = Math.cos(angle) * speed;
                    this.particleVY[i] = Math.sin(angle) * speed;
                }
                this.phase = "HEART_SHATTER";
                this.phaseStartTime = now;
            }

        // ── HEART_SHATTER (heart breaks apart before flower) ───────────────
        } else if (this.phase === "HEART_SHATTER") {
            for (var i = 0; i < this.count; i++) {
                this.particleX[i] += this.particleVX[i] * dt;
                this.particleY[i] += this.particleVY[i] * dt;
                this.particleVY[i] -= 40 * dt;
                this.particleVX[i] *= 0.97;
                this.particleVY[i] *= 0.97;
                var fadeT = Math.min(elapsed / 800, 1);
                this.particleSizes[i] += ((3.5 * (1 - fadeT) + 1.0 * fadeT) - this.particleSizes[i]) * 0.1;
                this.colorR[i] += (1.0 - this.colorR[i]) * 0.03;
                this.colorG[i] += (0.42 - this.colorG[i]) * 0.03;
                this.colorB[i] += (0.62 - this.colorB[i]) * 0.03;
            }
            if (elapsed >= 800) {
                this._loadFlower();
            }

        // ── FLOWER (staggered petal bloom) ──────────────────────────────────
        } else if (this.phase === "FLOWER") {
            var PETALS = 5;
            var petalDelay = mobile ? 200 : 150; // ms between petals
            var bloomDur = mobile ? 1400 : 1200;  // ms for each petal to fully form

            for (var i = 0; i < this.count; i++) {
                var ft = this.flowerTargets[i % this.flowerTargets.length];
                var pIdx = this.flowerPetalIndex[i];
                // Stamen (center) = petal -1, always blooms first
                var isStamen = (ft.color === "#FFE066");
                var myDelay = isStamen ? 0 : (pIdx + 1) * petalDelay;
                var myElapsed = Math.max(0, elapsed - myDelay);
                var tP = Math.min(myElapsed / bloomDur, 1);
                var easeP = 1 - Math.pow(1 - tP, 3);

                this.particleX[i] += (ft.x - this.particleX[i]) * easeP * 0.12;
                this.particleY[i] += (ft.y - this.particleY[i]) * easeP * 0.12;
                this.particleZ[i] += (0 - this.particleZ[i]) * 0.05;

                this.colorR[i] += (this.targetR[i] - this.colorR[i]) * 0.04;
                this.colorG[i] += (this.targetG[i] - this.colorG[i]) * 0.04;
                this.colorB[i] += (this.targetB[i] - this.colorB[i]) * 0.04;

                var targetSz = isStamen ? ft.size : ft.size * easeP;
                this.particleSizes[i] += (Math.max(0.5, targetSz) - this.particleSizes[i]) * 0.06;
            }

            // Camera: start level, slowly angle downward as flower blooms
            var camTiltFlower = Math.sin(Math.min(elapsed / 2000, 1) * Math.PI * 0.5) * (mobile ? -15 : -22);
            cam.position.y += (camTiltFlower - cam.position.y) * 0.015;
            cam.lookAt(0, 0, 0);
            cam.position.z += ((mobile ? 380 : 500) - cam.position.z) * 0.02;

            var totalDelay = (PETALS + 1) * petalDelay + bloomDur;
            if (elapsed >= totalDelay) {
                this.flowerTotalRot = 0;
                this.phase = "FLOWER_HOLD";
                this.phaseStartTime = now;
            }

        // ── FLOWER_HOLD (rotate 1 full turn, camera top-down) ───────────────
        } else if (this.phase === "FLOWER_HOLD") {
            var flowerSpinSpeed = mobile ? 1.0 : 1.3;
            this.flowerRotation += dt * flowerSpinSpeed;
            this.flowerTotalRot += dt * flowerSpinSpeed;

            // Camera: lerp to top-down view (~20° from above) then back
            var rotFrac = Math.min(this.flowerTotalRot / (Math.PI * 2), 1);
            // Arc: peak tilt at half-turn
            var topDownAngle = Math.sin(rotFrac * Math.PI) * (mobile ? -35 : -55);
            cam.position.y += (topDownAngle - cam.position.y) * 0.025;
            cam.lookAt(0, 0, 0);

            var cosR = Math.cos(this.flowerRotation);
            var sinR = Math.sin(this.flowerRotation);
            for (var i = 0; i < this.count; i++) {
                var ft = this.flowerTargets[i % this.flowerTargets.length];
                var rx = ft.x * cosR - ft.y * sinR;
                var ry = ft.x * sinR + ft.y * cosR;
                this.particleX[i] += (rx - this.particleX[i]) * 0.06;
                this.particleY[i] += (ry - this.particleY[i]) * 0.06;
                this.particleZ[i] += (0 - this.particleZ[i]) * 0.04;
                this.colorR[i] += (this.targetR[i] - this.colorR[i]) * 0.02;
                this.colorG[i] += (this.targetG[i] - this.colorG[i]) * 0.02;
                this.colorB[i] += (this.targetB[i] - this.colorB[i]) * 0.02;
            }

            if (this.flowerTotalRot >= Math.PI * 2) {
                cam.position.y = 0;
                this._startFireworks();
            }

        // ── FIREWORKS (3 waves) ──────────────────────────────────────────────
        } else if (this.phase === "FIREWORKS") {
            this.fireworkWaveTimer += dt;

            // Wave 0 at 0s: burst outward from center (already set in _startFireworks)
            // Wave 1 at 0.35s: re-energize with upward burst
            // Wave 2 at 0.7s: scatter to edges like opening curtain
            if (this.fireworkWave === 0 && this.fireworkWaveTimer >= 0.35) {
                this.fireworkWave = 1;
                var speed1 = mobile ? 200 : 320;
                for (var i = 0; i < this.count; i++) {
                    var angle1 = (i / this.count) * Math.PI * 2;
                    this.particleVX[i] += Math.cos(angle1) * speed1 * 0.5;
                    this.particleVY[i] += speed1 * (0.3 + Math.random() * 0.7); // mostly upward
                    var fw1 = ["#FFE066","#FF99BB","#FFFFFF","#CC00FF"];
                    var c1 = this._hexToRGB(fw1[Math.floor(Math.random() * fw1.length)]);
                    this.colorR[i] = c1.r; this.colorG[i] = c1.g; this.colorB[i] = c1.b;
                    this.particleSizes[i] = 2.5 + Math.random() * 2;
                }
            }
            if (this.fireworkWave === 1 && this.fireworkWaveTimer >= 0.7) {
                this.fireworkWave = 2;
                var speed2 = mobile ? 180 : 280;
                for (var i = 0; i < this.count; i++) {
                    // Curtain: scatter left/right outward
                    var side = (i % 2 === 0) ? 1 : -1;
                    this.particleVX[i] += side * speed2 * (0.4 + Math.random() * 0.6);
                    this.particleVY[i] += (Math.random() - 0.3) * speed2 * 0.5;
                    var fw2 = ["#FF6B9D","#FFB3D1","#FF3377","#FFE066"];
                    var c2 = this._hexToRGB(fw2[i % fw2.length]);
                    this.colorR[i] = c2.r; this.colorG[i] = c2.g; this.colorB[i] = c2.b;
                    this.particleSizes[i] = 2 + Math.random() * 2;
                }
            }

            for (var i = 0; i < this.count; i++) {
                this.particleX[i] += this.particleVX[i] * dt;
                this.particleY[i] += this.particleVY[i] * dt;
                this.particleVY[i] -= 60 * dt; // gravity
                this.particleVX[i] *= 0.97;
                this.particleVY[i] *= 0.97;
                this.colorR[i] *= 0.975;
                this.colorG[i] *= 0.975;
                this.colorB[i] *= 0.975;
                this.particleSizes[i] *= 0.987;
            }

            if (this.fireworkWaveTimer >= 1.4) {
                this.finish(false);
            }
        }

        // ── Update GPU buffers ───────────────────────────────────────────────
        var posArr = this.geometry.attributes.position.array;
        var colorArr = this.geometry.attributes.aColor.array;
        var sizeArr = this.geometry.attributes.aSize.array;
        for (var i = 0; i < this.count; i++) {
            posArr[i * 3]     = this.particleX[i];
            posArr[i * 3 + 1] = this.particleY[i];
            posArr[i * 3 + 2] = this.particleZ[i];
            colorArr[i * 3]     = this.colorR[i];
            colorArr[i * 3 + 1] = this.colorG[i];
            colorArr[i * 3 + 2] = this.colorB[i];
            sizeArr[i] = this.particleSizes[i];
        }
        this.geometry.attributes.position.needsUpdate = true;
        this.geometry.attributes.aColor.needsUpdate = true;
        this.geometry.attributes.aSize.needsUpdate = true;
    }

    _startFireworks() {
        var speed = WD.runtime.isMobile ? 260 : 400;
        var colors = ["#FF6B9D","#FFB3D1","#FF3377","#FFE066","#CC00FF","#FF99BB","#FFFFFF"];
        for (var i = 0; i < this.count; i++) {
            var angle = Math.random() * Math.PI * 2;
            var mag = (0.3 + Math.random() * 0.7) * speed;
            this.particleVX[i] = Math.cos(angle) * mag;
            this.particleVY[i] = Math.sin(angle) * mag + speed * 0.25;
            var hex = colors[Math.floor(Math.random() * colors.length)];
            var c = this._hexToRGB(hex);
            this.colorR[i] = c.r;
            this.colorG[i] = c.g;
            this.colorB[i] = c.b;
            this.particleSizes[i] = 3 + Math.random() * 3;
        }
        this.fireworkWave = 0;
        this.fireworkWaveTimer = 0;
        this.phase = "FIREWORKS";
        this.phaseStartTime = performance.now();
        // CSS flash
        this._flashScreen();
    }

    _flashScreen() {
        var flash = document.createElement("div");
        flash.style.cssText = [
            "position:fixed", "inset:0", "pointer-events:none",
            "z-index:9998", "background:rgba(255,180,220,0.22)",
            "transition:opacity 0.4s ease", "opacity:1"
        ].join(";");
        document.body.appendChild(flash);
        requestAnimationFrame(function () { flash.style.opacity = "0"; });
        setTimeout(function () { if (flash.parentNode) flash.parentNode.removeChild(flash); }, 500);
    }

    _easeInOutElastic(t) {
        if (t === 0) return 0;
        if (t === 1) return 1;
        var c4 = (2 * Math.PI) / 4.5;
        return t < 0.5
            ? -(Math.pow(2, 20 * t - 10) * Math.sin((20 * t - 11.125) * c4)) / 2
            : (Math.pow(2, -20 * t + 10) * Math.sin((20 * t - 11.125) * c4)) / 2 + 1;
    }

    finish(instant) {
        if (this.finished) return;
        this.finished = true;
        this.active = false;
        WD.dom.introScreen.classList.add("is-done");
        var self = this;
        var finalize = function () {
            self.dispose();
            if (typeof self.onDone === "function") self.onDone();
        };
        if (instant || WD.reduceMotionQuery.matches) finalize();
        else setTimeout(finalize, 300);
    }

    dispose() {
        WD.dom.skipIntro.removeEventListener("click", this.skipHandler);
        if (this.points) {
            this.world.scene.remove(this.points);
            this.points.geometry.dispose();
            this.points.material.dispose();
            this.points = null;
        }
    }
};
