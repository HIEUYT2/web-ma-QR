window.WD = window.WD || {};

WD.runtime = {
    isMobile: window.innerWidth < 768,
    isLowEnd: (navigator.hardwareConcurrency || 4) <= 4
};

WD.Config = {
    PARTICLE_COUNT: WD.runtime.isLowEnd
        ? (WD.runtime.isMobile ? 8000 : 14000)
        : (WD.runtime.isMobile ? 14000 : 24000),
    STAR_COUNT: (WD.runtime.isMobile || WD.runtime.isLowEnd) ? 1000 : 3000,
    COLORS: {
        bg: "#04040f",
        pink: "#ff6b9d",
        violet: "#b44dff",
        gold: "#ffd27a",
        white: "#fffdf8"
    },
    STAR_PALETTE: ["#ff6b9d", "#ff84b2", "#ff9fc6", "#ffc2db"],
    CARD_THEMES: ["#FF6B9D", "#C084FC", "#60A5FA", "#34D399", "#FBBF24"],
    INTRO_SEQUENCE: [
        "Happy",
        "Women's Day",
        "8 / 3"
    ],
    RECIPIENT_NAMES: [
        "Cô Điệp",
        "Trần Ngọc Khả Ái",
        "Trần Thúy An",
        "Nguyễn Nhật Ánh Dương",
        "Bùi Huỳnh Khánh Linh",
        "Lê Hoàng Thiên Nhi",
        "Nguyễn Ngọc Hà Như",
        "Nguyễn Thị Hồng Thắm",
        "Võ Yến Thanh",
        "Nguyễn Minh Thy",
        "Nguyễn Thị Bảo Trân",
        "Nguyễn Ngọc Bảo Trân",
        "Nguyễn Thị Thảo Trinh",
        "Nguyễn Phạm Nhã Trúc",
        "Phan Thanh Trúc",
        "Trần Tường Vi",
        "Nguyễn Phương Vy",
        "Lê Phan Ngọc Yến"
    ],
    PHASE_DURATION: {
        GATHER: 800,
        HOLD: 1400,
        EXPLODE: 600
    }
};
