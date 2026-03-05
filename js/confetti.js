window.WD = window.WD || {};

WD.launchTitleConfetti = function (anchor) {
    if (!anchor || !WD.dom.confettiLayer) return;
    var rect = anchor.getBoundingClientRect();
    var originX = rect.left + rect.width / 2;
    var originY = rect.top + rect.height / 2;
    var colors = [WD.Config.COLORS.pink, WD.Config.COLORS.gold, WD.Config.COLORS.violet, WD.Config.COLORS.white];
    var U = WD.Utils;

    for (var i = 0; i < 60; i++) {
        var piece = document.createElement("div");
        piece.className = "confetti-piece";
        piece.style.left = originX.toFixed(2) + "px";
        piece.style.top = originY.toFixed(2) + "px";
        piece.style.background = colors[i % colors.length];
        piece.style.setProperty("--dx", U.random(-250, 250).toFixed(1) + "px");
        piece.style.setProperty("--dy", U.random(-260, -80).toFixed(1) + "px");
        piece.style.setProperty("--rot", U.random(-760, 760).toFixed(1) + "deg");
        piece.style.animationDelay = U.random(0, 0.18).toFixed(2) + "s";
        WD.dom.confettiLayer.appendChild(piece);
        (function (el) {
            setTimeout(function () {
                if (el.parentNode) el.parentNode.removeChild(el);
            }, 3000);
        })(piece);
    }
};
