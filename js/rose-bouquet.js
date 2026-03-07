window.WD = window.WD || {};

WD.RoseBouquet = {
    // Helper: lerp between two hex colors
    _lerpHex(hex1, hex2, t) {
        var r1 = parseInt(hex1.slice(1, 3), 16), g1 = parseInt(hex1.slice(3, 5), 16), b1 = parseInt(hex1.slice(5, 7), 16);
        var r2 = parseInt(hex2.slice(1, 3), 16), g2 = parseInt(hex2.slice(3, 5), 16), b2 = parseInt(hex2.slice(5, 7), 16);
        var r = Math.round(r1 + (r2 - r1) * t);
        var g = Math.round(g1 + (g2 - g1) * t);
        var b = Math.round(b1 + (b2 - b1) * t);
        return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
    },

    // Test if point (px,py) is inside the heart curve
    _insideHeart(px, py) {
        // Normalize to heart parametric space (~-16..16 x, ~-14..17 y)
        var nx = px / 16;
        var ny = py / 13;
        // Implicit heart equation: (x² + y² - 1)³ - x²y³ < 0
        var x2 = nx * nx, y2 = ny * ny;
        var v = x2 + y2 - 1;
        return (v * v * v - x2 * ny * ny * ny) < 0;
    },

    // Generate filled 3D heart points (with Z depth for Y-axis rotation)
    getHeartPoints(count) {
        var points = [];
        var mobile = window.innerWidth < 768;
        var scale = mobile ? 6 : 18;
        var maxDepth = mobile ? 20 : 60;

        // Denser heart fill for clearer silhouette + less aura
        var innerCount = Math.floor(count * 0.93);
        var auraCount = count - innerCount;

        // Inner heart fill using rejection sampling for uniform distribution
        var filled = 0;
        var maxAttempts = innerCount * 8;
        var attempts = 0;
        while (filled < innerCount && attempts < maxAttempts) {
            attempts++;
            var rx = (Math.random() - 0.5) * 34; // -17..17
            var ry = Math.random() * 32 - 15;      // -15..17
            if (!this._insideHeart(rx, ry)) continue;

            // Normalized distance from center for shading
            var nx = rx / 16;
            var ny2 = (ry - 2) / 13;
            var edgeDist = Math.min(1, Math.sqrt(nx * nx + ny2 * ny2));

            // Z depth: smooth bell curve, center bulges forward
            var zShape = Math.exp(-edgeDist * edgeDist * 2.8);
            var iz = zShape * maxDepth + (Math.random() - 0.5) * maxDepth * 0.12;

            // Smooth gradient color: hot white center → bright pink → deep rose → dark edge
            var color;
            if (edgeDist < 0.25) {
                color = this._lerpHex("#FFD4E8", "#FF6B9D", edgeDist / 0.25);
            } else if (edgeDist < 0.55) {
                color = this._lerpHex("#FF6B9D", "#E8255A", (edgeDist - 0.25) / 0.3);
            } else if (edgeDist < 0.8) {
                color = this._lerpHex("#E8255A", "#AA1144", (edgeDist - 0.55) / 0.25);
            } else {
                color = this._lerpHex("#AA1144", "#660022", (edgeDist - 0.8) / 0.2);
            }

            points.push({
                x: rx * scale,
                y: ry * scale,
                z: iz,
                color: color
            });
            filled++;
        }

        // Fill remaining if rejection sampling didn't produce enough
        while (filled < innerCount) {
            var t = (filled / innerCount) * Math.PI * 2;
            var bx = 16 * Math.pow(Math.sin(t), 3);
            var by = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
            var r = Math.pow(Math.random(), 0.5);
            points.push({
                x: bx * r * scale,
                y: by * r * scale,
                z: Math.random() * maxDepth * 0.5,
                color: "#CC2255"
            });
            filled++;
        }

        // Aura glow particles: scattered just outside the heart edge
        for (var i = 0; i < auraCount; i++) {
            var at = Math.random() * Math.PI * 2;
            var ax = 16 * Math.pow(Math.sin(at), 3);
            var ay = 13 * Math.cos(at) - 5 * Math.cos(2 * at) - 2 * Math.cos(3 * at) - Math.cos(4 * at);
            // Push slightly outside boundary
            var spread = 1.05 + Math.random() * 0.2;
            points.push({
                x: ax * spread * scale,
                y: ay * spread * scale,
                z: (Math.random() - 0.5) * maxDepth * 0.3,
                color: this._lerpHex("#FF99CC", "#FF3377", Math.random())
            });
        }

        // Shuffle
        for (var i = points.length - 1; i > 0; i--) {
            var j = Math.floor(Math.random() * (i + 1));
            var tmp = points[i];
            points[i] = points[j];
            points[j] = tmp;
        }

        return points;
    },

    // Generate flower with 5 petals using parametric math
    getFlowerPoints(totalCount) {
        var points = [];
        var PETALS = 5;
        var mobile = window.innerWidth < 768;
        var S = mobile ? 0.28 : 1.0; // scale factor for mobile

        // Layer 1: Stamens (center circle) - 10%
        var stamens = Math.floor(totalCount * 0.10);
        for (var i = 0; i < stamens; i++) {
            var r = Math.random() * 60 * S;
            var a = Math.random() * Math.PI * 2;
            points.push({
                x: Math.cos(a) * r,
                y: Math.sin(a) * r,
                color: "#FFE066",
                size: 4
            });
        }

        // Layer 2: 5 Outer petals - 60%
        var petalCount = Math.floor(totalCount * 0.60);
        for (var i = 0; i < petalCount; i++) {
            var petalIndex = Math.floor(Math.random() * PETALS);
            var baseAngle = (petalIndex / PETALS) * Math.PI * 2;

            var u = Math.random();
            var v = (Math.random() - 0.5);

            var petalLength = 300 * S;
            var petalWidth = 120 * S;

            var localX = u * petalLength * (1 - u * 0.3);
            var localY = v * petalWidth * Math.sin(u * Math.PI) * 0.8;

            var cos = Math.cos(baseAngle - Math.PI / 2);
            var sin = Math.sin(baseAngle - Math.PI / 2);
            var offset = 50 * S;

            var color;
            if (u < 0.3) color = "#CC2255";
            else if (u < 0.7) color = "#FF6B9D";
            else color = "#FFB3D1";

            points.push({
                x: cos * (localX + offset) - sin * localY,
                y: sin * (localX + offset) + cos * localY,
                color: color,
                size: 3.5 + Math.random() * 1.5
            });
        }

        // Layer 3: 5 Inner petals (rotated 36°) - 20%
        var innerCount = Math.floor(totalCount * 0.20);
        for (var i = 0; i < innerCount; i++) {
            var petalIndex = Math.floor(Math.random() * PETALS);
            var baseAngle = (petalIndex / PETALS) * Math.PI * 2 + Math.PI / PETALS;

            var u = Math.random();
            var v = (Math.random() - 0.5);

            var petalLength = 180 * S;
            var petalWidth = 75 * S;

            var localX = u * petalLength * (1 - u * 0.4);
            var localY = v * petalWidth * Math.sin(u * Math.PI);

            var cos = Math.cos(baseAngle - Math.PI / 2);
            var sin = Math.sin(baseAngle - Math.PI / 2);
            var offset = 40 * S;

            points.push({
                x: cos * (localX + offset) - sin * localY,
                y: sin * (localX + offset) + cos * localY,
                color: u < 0.5 ? "#FF3377" : "#FF99BB",
                size: 3
            });
        }

        // Layer 4: Sepals (green) - 10%
        var sepalCount = Math.floor(totalCount * 0.10);
        for (var i = 0; i < sepalCount; i++) {
            var petalIndex = Math.floor(Math.random() * PETALS);
            var baseAngle = (petalIndex / PETALS) * Math.PI * 2 + Math.PI / PETALS;

            var u = Math.random() * 0.6;
            var v = (Math.random() - 0.5) * 0.6;

            var cos = Math.cos(baseAngle - Math.PI / 2);
            var sin = Math.sin(baseAngle - Math.PI / 2);

            points.push({
                x: cos * (u * 110 * S + 40 * S) - sin * v * 65 * S,
                y: sin * (u * 110 * S + 40 * S) + cos * v * 65 * S,
                color: "#228833",
                size: 2.5
            });
        }

        // Shuffle
        for (var i = points.length - 1; i > 0; i--) {
            var j = Math.floor(Math.random() * (i + 1));
            var tmp = points[i];
            points[i] = points[j];
            points[j] = tmp;
        }

        return points;
    }
};
