let md = new MobileDetect(window.navigator.userAgent)
if (md.mobile()) {
	setstyle = document.createElement("LINK")
	setstyle.setAttribute("rel", "stylesheet")
	setstyle.setAttribute('type', "text/css")
	setstyle.setAttribute("media", "screen")
	setstyle.setAttribute("href", "lib/css/mobile-modal.css")
	document.body.appendChild(setstyle)
} else {
	setstyle = document.createElement("LINK")
	setstyle.setAttribute("rel", "stylesheet")
	setstyle.setAttribute('type', "text/css")
	setstyle.setAttribute("media", "screen")
	setstyle.setAttribute("href", "lib/css/desktop-modal.css")
	document.body.appendChild(setstyle)
}

if (window.innerWidth > 600) {
	var video = document.getElementById("background")
	var source = document.createElement("source")
	source.src = "lib\\res\\background2.mp4"
	//createDocumentFragment('<source src="lib/res/background.mp4" type="video/mp4">')
	video.appendChild(source)
	//console.log("success")
};

function scrollto(selector) {
	document.querySelector(selector).scrollIntoView({
		block: "start",
		inline: "nearest",
		behavior: 'smooth'
	});
}

async function closeMod(selector) {
	var md = new MobileDetect(window.navigator.userAgent)
	if (md.mobile()) {
		var slideDown = anime({
			targets: "#" + selector,
			translateY: '100vh',
			duration: 500,
			easing: 'easeInOutQuart',
		})
		var finished = await slideDown.finished
	}
	modal = document.getElementById(selector)
	modal.setAttribute("style", "dsiplay:none;")
	document.body.setAttribute("style", "overflow:auto;")

}

function openModal(selector) {
	var md = new MobileDetect(window.navigator.userAgent)
	var modal = document.getElementById(selector)
	modal.setAttribute("style", "display:block;")
	if (md.mobile()) {
		console.log(modal)
		document.body.setAttribute("style", "overflow:hidden;")
		var slideUp = anime({
			targets: "#" + selector,
			translateY: '-100vh',
			duration: 500,
			//direction: 'reverse',
			easing: 'easeInOutQuart'
		})
	}
}