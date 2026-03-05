window.WD = window.WD || {};

WD.RoseBouquet = {
    // Generate filled 3D heart points (with Z depth for Y-axis rotation)
    getHeartPoints(count) {
        var points = [];
        var mobile = window.innerWidth < 768;
        var scale = mobile ? 6 : 18;
        // Max Z depth: center of heart bulges forward, edges taper back
        var maxDepth = mobile ? 14 : 42;

        for (var i = 0; i < count; i++) {
            var t = (i / count) * Math.PI * 2;
            var x = 16 * Math.pow(Math.sin(t), 3);
            var y = 13 * Math.cos(t)
                  - 5 * Math.cos(2 * t)
                  - 2 * Math.cos(3 * t)
                  - Math.cos(4 * t);
            // Fill inside heart uniformly
            var r = Math.pow(Math.random(), 0.5);
            var a = Math.random() * Math.PI * 2;
            var ix = x * r + Math.cos(a) * 2 * (1 - r);
            var iy = y * r + Math.sin(a) * 2 * (1 - r);

            // Z depth: proportional to how "inside" the point is.
            // Normalize ix/iy to heart boundary radius (~16 units wide, ~13 tall)
            var nx = ix / 16;
            var ny = (iy - 2) / 13; // shift y center slightly
            // Distance from center (0=center, 1=edge)
            var edgeDist = Math.min(1, Math.sqrt(nx * nx + ny * ny));
            // Bell curve: center bulges forward, edges flat
            var zShape = Math.exp(-edgeDist * edgeDist * 3.5);
            // Add slight random jitter for organic feel
            var iz = zShape * maxDepth + (Math.random() - 0.5) * maxDepth * 0.15;

            var dist = Math.sqrt(ix * ix + iy * iy);
            // Shade: center brighter (pink), outer rim darker (deep red), back darker
            var depthShade = zShape; // 1=front, 0=back
            var color;
            if (depthShade > 0.7)      color = "#FF6B9D"; // front center: bright pink
            else if (depthShade > 0.4) color = "#CC0044"; // mid: deep red
            else                       color = "#880033"; // back/rim: dark

            points.push({
                x: ix * scale,
                y: iy * scale,
                z: iz,
                color: color
            });
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
