function revealPage(){
    console.log("Clickydoo")
    jQuery(this).addClass('active');
    jQuery('.page').addClass('active');
};

jQuery('.close').click(function(){
    jQuery('.circle').removeClass('active');
    jQuery('.page').removeClass('active');
});