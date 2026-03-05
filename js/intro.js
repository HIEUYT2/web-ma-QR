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
        // Add intro texts as single-line steps
        for (var i = 0; i < WD.Config.INTRO_SEQUENCE.length; i++) {
            this.sequence.push({ type: "single", text: WD.Config.INTRO_SEQUENCE[i] });
        }
        // Pair recipient names 2 at a time
        var names = WD.Config.RECIPIENT_NAMES;
        for (var i = 0; i < names.length; i += 2) {
            if (i + 1 < names.length) {
                this.sequence.push({ type: "pair", line1: names[i], line2: names[i + 1] });
            } else {
                this.sequence.push({ type: "single", text: names[i] });
            }
        }

        // Current step in the sequence
        this.currentStep = 0;
        this.phase = "INIT";   // INIT, GATHER, HOLD, EXPLODE, HEART, FLOWER, FLOWER_HOLD
        this.phaseStartTime = performance.now();

        // Particle arrays
        this.particleX = new Float32Array(count);
        this.particleY = new Float32Array(count);
        this.particleZ = new Float32Array(count);
        this.particleVX = new Float32Array(count);
        this.particleVY = new Float32Array(count);

        // Per-particle colors (RGB 0-1)
        this.colorR = new Float32Array(count);
        this.colorG = new Float32Array(count);
        this.colorB = new Float32Array(count);
        // Target colors for lerping
        this.targetR = new Float32Array(count);
        this.targetG = new Float32Array(count);
        this.targetB = new Float32Array(count);

        // Per-particle sizes
        this.particleSizes = new Float32Array(count);

        // Initialize particles at random positions
        for (var i = 0; i < count; i++) {
            this.particleX[i] = (Math.random() - 0.5) * 800;
            this.particleY[i] = (Math.random() - 0.5) * 600;
            this.particleZ[i] = (Math.random() - 0.5) * 200;
            this.particleVX[i] = 0;
            this.particleVY[i] = 0;
            this.particleSizes[i] = 1;
            // Start pink
            this.colorR[i] = 1.0;
            this.colorG[i] = 0.42;
            this.colorB[i] = 0.62;
            this.targetR[i] = this.colorR[i];
            this.targetG[i] = this.colorG[i];
            this.targetB[i] = this.colorB[i];
        }

        // Current targets (x, y pairs)
        this.targets = [];

        // Flower rotation
        this.flowerRotation = 0;

        // Build Three.js objects
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
            sizes[i] = 1;
        }

        this.geometry = new THREE.BufferGeometry();
        this.geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
        this.geometry.setAttribute("aColor", new THREE.BufferAttribute(colors, 3));
        this.geometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));

        this.uniforms = {
            uOpacity: { value: 0.9 }
        };

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
                "  float baseMul = " + (WD.runtime.isMobile ? "350.0" : "350.0") + ";",
                "  gl_PointSize = aSize * (baseMul / dist);",
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

        // Load first step
        this._loadStep(0);
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

        // Set gradient colors based on Y position
        for (var i = 0; i < this.count; i++) {
            if (i < this.targets.length) {
                var ny = (this.targets[i].y + 150) / 300; // normalize 0..1
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
        for (var i = 0; i < this.count; i++) {
            var hp = heartPoints[i % heartPoints.length];
            this.targets.push({ x: hp.x, y: hp.y });
            var c = this._hexToRGB(hp.color);
            this.targetR[i] = c.r;
            this.targetG[i] = c.g;
            this.targetB[i] = c.b;
        }
        this.phase = "HEART";
        this.phaseStartTime = performance.now();
    }

    _loadFlower() {
        var flowerPoints = WD.RoseBouquet.getFlowerPoints(this.count);
        this.flowerTargets = [];
        for (var i = 0; i < this.count; i++) {
            var fp = flowerPoints[i % flowerPoints.length];
            this.flowerTargets.push({ x: fp.x, y: fp.y, color: fp.color, size: fp.size || 2.5 });
            var c = this._hexToRGB(fp.color);
            this.targetR[i] = c.r;
            this.targetG[i] = c.g;
            this.targetB[i] = c.b;
        }
        this.flowerRotation = 0;
        this.phase = "FLOWER";
        this.phaseStartTime = performance.now();
    }

    update(dt) {
        if (!this.active) return;

        var now = performance.now();
        var elapsed = now - this.phaseStartTime;
        var DUR = WD.Config.PHASE_DURATION;
        var cam = this.world.camera;

        if (this.phase === "GATHER") {
            var t = Math.min(elapsed / DUR.GATHER, 1);
            var ease = 1 - Math.pow(1 - t, 3); // easeOutCubic

            for (var i = 0; i < this.count; i++) {
                if (i < this.targets.length) {
                    this.particleX[i] += (this.targets[i].x - this.particleX[i]) * ease * 0.22;
                    this.particleY[i] += (this.targets[i].y - this.particleY[i]) * ease * 0.22;
                    this.particleZ[i] += (0 - this.particleZ[i]) * 0.1;
                } else {
                    // Extra particles drift away
                    this.particleX[i] += (this.particleX[i] * 1.001 - this.particleX[i]) * 0.01;
                }
                // Lerp size: 1 → 4
                this.particleSizes[i] += (4 - this.particleSizes[i]) * 0.08;
                // Lerp colors
                this.colorR[i] += (this.targetR[i] - this.colorR[i]) * 0.05;
                this.colorG[i] += (this.targetG[i] - this.colorG[i]) * 0.05;
                this.colorB[i] += (this.targetB[i] - this.colorB[i]) * 0.05;
            }

            var gatherZoom = WD.runtime.isMobile ? 350 : 420;
            cam.position.z += (gatherZoom - cam.position.z) * 0.03;

            if (elapsed >= DUR.GATHER) {
                this.phase = "HOLD";
                this.phaseStartTime = now;
            }

        } else if (this.phase === "HOLD") {
            // Particles stay in position
            for (var i = 0; i < this.count; i++) {
                if (i < this.targets.length) {
                    this.particleX[i] += (this.targets[i].x - this.particleX[i]) * 0.25;
                    this.particleY[i] += (this.targets[i].y - this.particleY[i]) * 0.25;
                    this.particleZ[i] += (0 - this.particleZ[i]) * 0.15;
                }
                this.particleSizes[i] = 4;
            }

            if (elapsed >= DUR.HOLD) {
                if (this.currentStep >= this.sequence.length - 1) {
                    // All names shown, go to heart
                    this._loadHeart();
                } else {
                    this.phase = "EXPLODE";
                    this.phaseStartTime = now;
                }
            }

        } else if (this.phase === "EXPLODE") {
            if (elapsed < 50) {
                // Set random velocities once
                for (var i = 0; i < this.count; i++) {
                    this.particleVX[i] = (Math.random() - 0.5) * 50;
                    this.particleVY[i] = (Math.random() - 0.5) * 50;
                }
            }

            for (var i = 0; i < this.count; i++) {
                this.particleX[i] += this.particleVX[i] * dt;
                this.particleY[i] += this.particleVY[i] * dt;
                // Shrink size
                this.particleSizes[i] += (1 - this.particleSizes[i]) * 0.15;
                // Dampen velocity
                this.particleVX[i] *= 0.96;
                this.particleVY[i] *= 0.96;
            }

            if (elapsed >= DUR.EXPLODE) {
                this._loadStep(this.currentStep + 1);
            }

        } else if (this.phase === "HEART") {
            var t = Math.min(elapsed / 1000, 1);
            var ease = 1 - Math.pow(1 - t, 3);

            for (var i = 0; i < this.count; i++) {
                if (i < this.targets.length) {
                    this.particleX[i] += (this.targets[i].x - this.particleX[i]) * ease * 0.15;
                    this.particleY[i] += (this.targets[i].y - this.particleY[i]) * ease * 0.15;
                    this.particleZ[i] += (0 - this.particleZ[i]) * 0.05;
                }
                this.particleSizes[i] += (3.5 - this.particleSizes[i]) * 0.06;
                this.colorR[i] += (this.targetR[i] - this.colorR[i]) * 0.04;
                this.colorG[i] += (this.targetG[i] - this.colorG[i]) * 0.04;
                this.colorB[i] += (this.targetB[i] - this.colorB[i]) * 0.04;
            }

            var heartZoom = WD.runtime.isMobile ? 380 : 400;
            cam.position.z += (heartZoom - cam.position.z) * 0.02;

            if (elapsed >= 1800) {
                this._loadFlower();
            }

        } else if (this.phase === "FLOWER") {
            var t = Math.min(elapsed / 1800, 1);
            var ease = this._easeInOutElastic(t);

            for (var i = 0; i < this.count; i++) {
                var ft = this.flowerTargets[i % this.flowerTargets.length];
                this.particleX[i] += (ft.x - this.particleX[i]) * 0.08 * (1 + ease);
                this.particleY[i] += (ft.y - this.particleY[i]) * 0.08 * (1 + ease);
                this.particleZ[i] += (0 - this.particleZ[i]) * 0.05;

                // Lerp to flower colors
                this.colorR[i] += (this.targetR[i] - this.colorR[i]) * 0.03;
                this.colorG[i] += (this.targetG[i] - this.colorG[i]) * 0.03;
                this.colorB[i] += (this.targetB[i] - this.colorB[i]) * 0.03;

                this.particleSizes[i] += (ft.size - this.particleSizes[i]) * 0.04;
            }

            var flowerZoom = WD.runtime.isMobile ? 380 : 500;
            cam.position.z += (flowerZoom - cam.position.z) * 0.02;

            if (elapsed >= 1800) {
                this.phase = "FLOWER_HOLD";
                this.phaseStartTime = now;
            }

        } else if (this.phase === "FLOWER_HOLD") {
            // Slowly rotate the flower
            this.flowerRotation += dt * 0.3;

            for (var i = 0; i < this.count; i++) {
                var ft = this.flowerTargets[i % this.flowerTargets.length];
                // Rotate target around center
                var rx = ft.x * Math.cos(this.flowerRotation) - ft.y * Math.sin(this.flowerRotation);
                var ry = ft.x * Math.sin(this.flowerRotation) + ft.y * Math.cos(this.flowerRotation);
                this.particleX[i] += (rx - this.particleX[i]) * 0.06;
                this.particleY[i] += (ry - this.particleY[i]) * 0.06;

                this.colorR[i] += (this.targetR[i] - this.colorR[i]) * 0.02;
                this.colorG[i] += (this.targetG[i] - this.colorG[i]) * 0.02;
                this.colorB[i] += (this.targetB[i] - this.colorB[i]) * 0.02;
            }

            // After 2 seconds, finish
            if (elapsed >= 2000) {
                this.finish(false);
            }
        }

        // Update Three.js buffers
        var posArr = this.geometry.attributes.position.array;
        var colorArr = this.geometry.attributes.aColor.array;
        var sizeArr = this.geometry.attributes.aSize.array;
        for (var i = 0; i < this.count; i++) {
            posArr[i * 3] = this.particleX[i];
            posArr[i * 3 + 1] = this.particleY[i];
            posArr[i * 3 + 2] = this.particleZ[i];
            colorArr[i * 3] = this.colorR[i];
            colorArr[i * 3 + 1] = this.colorG[i];
            colorArr[i * 3 + 2] = this.colorB[i];
            sizeArr[i] = this.particleSizes[i];
        }
        this.geometry.attributes.position.needsUpdate = true;
        this.geometry.attributes.aColor.needsUpdate = true;
        this.geometry.attributes.aSize.needsUpdate = true;
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
