var app = document.getElementById('text-here');

var typewriter = new Typewriter(app, {
	loop: true,
	cursor: ""
});

typewriter.typeString('IT')
    .pauseFor(1500)
    .deleteAll()
    .typeString('web design')
    .pauseFor(1500)
    .deleteAll()
    .typeString('Microsoft 365')
	.pauseFor(1500)
	.deleteAll()
	.start();