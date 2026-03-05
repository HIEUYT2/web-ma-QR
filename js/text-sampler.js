window.WD = window.WD || {};

WD.TextSampler = {
    // Sample a single line of text
    sample(text, maxPoints) {
        var w = 1600;
        var h = 400;
        var canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        var ctx = canvas.getContext("2d");

        ctx.fillStyle = "#000000";
        ctx.fillRect(0, 0, w, h);

        var fontSize = 220;
        var fontFamily = "'Arial Black', Impact, 'Franklin Gothic Heavy', sans-serif";
        ctx.font = "900 " + fontSize + "px " + fontFamily;
        while (ctx.measureText(text).width > w * 0.80 && fontSize > 60) {
            fontSize -= 10;
            ctx.font = "900 " + fontSize + "px " + fontFamily;
        }

        ctx.fillStyle = "#FFFFFF";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(text, w / 2, h / 2);

        var vw = window.innerWidth;
        var sc = vw < 768 ? 0.10 : 0.55;
        return this._extractPoints(ctx, w, h, maxPoints, sc);
    },

    // Sample two lines of text (name1 on top, name2 on bottom)
    sampleTwoLines(line1, line2, maxPoints) {
        var w = 1600;
        var h = 500;
        var canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        var ctx = canvas.getContext("2d");

        ctx.fillStyle = "#000000";
        ctx.fillRect(0, 0, w, h);

        var fontFamily = "'Arial Black', Impact, 'Franklin Gothic Heavy', sans-serif";
        ctx.fillStyle = "#FFFFFF";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        // Line 1 - top half
        var fontSize1 = 160;
        ctx.font = "900 " + fontSize1 + "px " + fontFamily;
        while (ctx.measureText(line1).width > w * 0.85 && fontSize1 > 50) {
            fontSize1 -= 8;
            ctx.font = "900 " + fontSize1 + "px " + fontFamily;
        }
        ctx.fillText(line1, w / 2, h * 0.30);

        // Line 2 - bottom half
        var fontSize2 = 160;
        ctx.font = "900 " + fontSize2 + "px " + fontFamily;
        while (ctx.measureText(line2).width > w * 0.85 && fontSize2 > 50) {
            fontSize2 -= 8;
            ctx.font = "900 " + fontSize2 + "px " + fontFamily;
        }
        ctx.fillText(line2, w / 2, h * 0.72);

        var vw = window.innerWidth;
        var sc = vw < 768 ? 0.10 : 0.50;
        return this._extractPoints(ctx, w, h, maxPoints, sc);
    },

    _extractPoints(ctx, w, h, maxPoints, scale) {
        var imageData = ctx.getImageData(0, 0, w, h);
        var pixels = imageData.data;
        var candidates = [];
        var step = 3;

        for (var y = 0; y < h; y += step) {
            for (var x = 0; x < w; x += step) {
                var idx = (y * w + x) * 4;
                if (pixels[idx] > 128) {
                    candidates.push({
                        x: (x - w / 2) * scale,
                        y: -(y - h / 2) * scale
                    });
                }
            }
        }

        // Shuffle
        for (var i = candidates.length - 1; i > 0; i--) {
            var j = Math.floor(Math.random() * (i + 1));
            var tmp = candidates[i];
            candidates[i] = candidates[j];
            candidates[j] = tmp;
        }

        if (candidates.length > maxPoints) {
            candidates = candidates.slice(0, maxPoints);
        }

        return candidates;
    }
};
