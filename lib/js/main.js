function sleep(ms) {
	return new Promise(resolve => setTimeout(resolve, ms));
}

function webRedirect(){
	window.location.href ='web.html';
};