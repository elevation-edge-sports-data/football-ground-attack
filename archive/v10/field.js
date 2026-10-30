/* Football Ground Attack Lab — field dimensions.
   World unit = 1 yard. Y runs south goal (0) toward north goal (length).
   X runs left sideline (0) toward right sideline (width). */
(function (root) {
	"use strict";

	const SPEC = {
		length: 100,
		endZone: 10,
		defaultWidth: 75,
		widthMin: 5,
		widthMax: 100,
		widthStep: 5,
		wideRef: 50,
		postGapFrac: 0.082,
		postGapMin: 2.6,
		postGapMax: 9.0,
		bodyInset: 1.5,
		midLogoHalf: 5,
		visibleYards: 58,
		pylonH: 1.35,
		crossbarH: 3.4,
		uprightH: 10.2,
		postSetback: 1.15
	};

	function clamp(n, a, b) {
		return Math.max(a, Math.min(b, n));
	}

	const Field = {
		spec: SPEC,
		width: SPEC.defaultWidth,

		get length() { return SPEC.length; },
		get endZone() { return SPEC.endZone; },
		get southGoal() { return 0; },
		get northGoal() { return SPEC.length; },
		get southBack() { return -SPEC.endZone; },
		get northBack() { return SPEC.length + SPEC.endZone; },
		get midfield() { return SPEC.length * 0.5; },
		get bodyCapY() { return SPEC.length + SPEC.endZone - SPEC.bodyInset; },
		get logoFrom() { return SPEC.length * 0.5 - SPEC.midLogoHalf; },
		get logoTo() { return SPEC.length * 0.5 + SPEC.midLogoHalf; },
		get visibleYards() { return SPEC.visibleYards; },

		clampWidth: function (w) {
			const n = parseInt(w, 10);
			const raw = isFinite(n) ? n : SPEC.defaultWidth;
			return clamp(raw, SPEC.widthMin, SPEC.widthMax);
		},
		setWidth: function (w) {
			this.width = this.clampWidth(w);
			return this.width;
		},
		left: function () { return 0; },
		right: function () { return this.width; },
		midX: function () { return this.width * 0.5; },
		postGapHalf: function () {
			return clamp(this.width * SPEC.postGapFrac, SPEC.postGapMin, SPEC.postGapMax);
		},
		hashHalf: function () { return this.postGapHalf(); },
		hashLeft: function () { return this.midX() - this.hashHalf(); },
		hashRight: function () { return this.midX() + this.hashHalf(); },
		fieldWideT: function () {
			return clamp((this.width - SPEC.wideRef) / SPEC.wideRef, 0, 1);
		},
		clampX: function (x) { return clamp(x, this.left(), this.right()); },
		clampY: function (y) { return clamp(y, this.southBack, this.northBack); },
		clampToHash: function (x) { return clamp(x, this.hashLeft(), this.hashRight()); },
		pylonYards: function () {
			return [this.southBack, this.southGoal, this.northGoal, this.northBack];
		}
	};

	Field.width = SPEC.defaultWidth;
	root.Field = Field;
})(typeof window !== "undefined" ? window : globalThis);
