export class DefaultCss {
	constructor() {
		
	}
	
	apply(canvas) {
		console.log("Applying css", canvas);

		canvas.style.display = "block";
		canvas.style.position = "absolute";
	}
}