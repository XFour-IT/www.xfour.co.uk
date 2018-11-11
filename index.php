<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8" />
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <title>XFour IT</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <link rel="stylesheet" type="text/css" media="screen" href="main.css" />
    <link rel="stylesheet" type="text/css" href="lib/js/modal.css" />
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/simplebar@latest/dist/simplebar.css">
    <script src="https://cdn.jsdelivr.net/npm/simplebar@latest/dist/simplebar.js"></script>
    <script scr="lib/js/modal.js"></script>
</head>
<body>
    <section id="sec1">
        <video autoplay muted loop id="background" poster="lib\res\backgroundposter.jpg">
        </video>
            <div id = "logo_area">
                <!-- Old Logo <img src="lib\res\Benjisoft_Logo_small.svg" id="center_logo" > -->
                <h3>XFour</h3>
                <p>Getting all small businesses online</p>
            </div>
            <div id = "indicator" onclick="scrollto('#sec2')">
                <svg id = "chevron" aria-hidden="true" data-prefix="fas" data-icon="chevron-down" class="svg-inline--fa fa-chevron-down fa-w-14" role="img" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512"><path id="chevron" fill="white" d="M207.029 381.476L12.686 187.132c-9.373-9.373-9.373-24.569 0-33.941l22.667-22.667c9.357-9.357 24.522-9.375 33.901-.04L224 284.505l154.745-154.021c9.379-9.335 24.544-9.317 33.901.04l22.667 22.667c9.373 9.373 9.373 24.569 0 33.941L240.971 381.476c-9.373 9.372-24.569 9.372-33.942 0z"></path></svg>
            </div>
    </section>
    <div id="wrapper">
        <section id="sec2">
            <h1>Projects</h1>
            <div id = "top-sub">
                <div class="shadow card" id="btnGH">
                    <img id = "placeholder" src="lib/res/gh.png"/>
                    <p>The Grand Hack</p>
                </div>
                <div  class="shadow card" id="btnWD">
                    <img id = "placeholder" src="lib/res/coding.svg"/>
                    <p>Web Design</p>
                </div>
                <div class="shadow card" id="btnDLN">
                    <img id = "placeholder" src="lib\res\datalesslogo.png"/>
                    <p>Dataless Network</p>
                </div>
            </div>
        </section>
        <section id="sec3">
            <h1>Partners</h1>
            <div class="shadow card" id="btnShopify">
                <img id = "placeholder" src="lib/res/shopifySquare.jpg"/>
                <p>Shopify</p>
            </div>
            <div  class="shadow card" id="btnMicrosoft">
                <img id = "placeholder" src="lib\res\edu_AEP_badge_vertical_lores.png"/>
                <p>Microsoft</p>
            </div>
            <div  class="shadow card" id="btnSoon">
                <img id = "placeholder" src="lib/res/more.svg"/>
                <p>Coming Soon</p>
            </div>
        </section>
        <!--
        <section id="sec4">
            <form id="reused_form">
                <div class="form-group">
                    <label>Name:</label><br>
                    <input type="text" name="name" class="form-control" placeholder="Enter Name">
                </div>
                <div class="form-group">
                    <label>Email:</label><br>
                    <input type="email" name="email" class="form-control" placeholder="Enter Email">
                </div>
                <div class="form-group">
                    <label> Message:</label><br>
                    <textarea rows="5" name="message" id="message" class="form-control" placeholder="Type Your Message"></textarea>
                </div>
                <div class="form-group">
                    <button id="enquire">Send &rarr;</button>
                </div>
            </form>
        </section>
        -->
    </div>
    <!-- Project Modals -->
    <div id="mdShopify" class="modal">
    <div class="modal-content">
        <span class="close">&times;</span>
        <p>Do you require a web e-commerce store? Shopify is the option for you. XFour are official shopify partners, get in touch today and see what we can do for you. </p>
        <button id="ctaShopify" class="cta" onclick="window.open('mailto:sales@xfour.co.uk?subject=Shopify Enquiree')">Get in Touch!</button>
    </div>
    </div>
    
    <script>
        if (window.innerWidth > 600){
            var video = document.getElementById("background")
            var source = document.createElement("source")
            source.src = "lib\\res\\background2.mp4"
            //createDocumentFragment('<source src="lib/res/background.mp4" type="video/mp4">')
            video.appendChild(source)
            //console.log("success")
        };

        function scrollto(selector){
            document.querySelector(selector).scrollIntoView({
                block: "start", 
                inline: "nearest",
                behavior: 'smooth'
            });
        }
    </script>
    <script src="form.js"></script>
</body>
</html>
