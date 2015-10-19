var currentPage = 0;
var moreContent = true;
var urlregex = new RegExp(/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{2,256}\.[a-z]{2,6}\b([-a-zA-Z0-9@:%_\+.~#?&//=]*)/);
var entityMap = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': '&quot;',
    "'": '&#39;',
    "/": '&#x2F;'
};

var shareTemplate, contentActionsTemplate;

$(document).ready(function() {
    shareTemplate = Handlebars.compile($("#share-buttons-template").html());
    contentActionsTemplate = Handlebars.compile($("#content-actions-template").html());
})

function getCookie(cname) {
    var name = cname + "=";
    var ca = document.cookie.split(';');
    for(var i=0; i<ca.length; i++) {
        var c = ca[i];
        while (c.charAt(0)==' ') c = c.substring(1);
        if (c.indexOf(name) != -1) return c.substring(name.length,c.length);
    }
    return "";
}

function fillData() {
    $("#email").text(getCookie("email"));
}

function escapeHtml(string) {
    return String(string).replace(/[&<>"'\/]/g, function (s) {
      return entityMap[s];
    });
}

/* -------------------- */
/* ---- Onboarding ---- */
/* -------------------- */
function onboarding() {
    $("html").addClass("stop-scroll");
    $("body").append($('<div>', { class: 'curtain' }).append($('<div>', { class: 'onboard-box-left hidden', id: 'postInfo' })));
    $("#postInfo").text("Save links here, or by adding \"iota.ly/\" before any URL");
    $("#postInfo").append($('<div>', { class: 'pink-button', id:'onboard-button', text: 'got it', onclick: 'onboard2()' }));
    $("#postInfo").fadeIn();
}
function onboard2() {
    $("#postInfo").fadeOut(function() {
        $("#postInfo").attr("id", "editInfo");
        $("#editInfo").attr("class", "onboard-box-right");
        $("#editInfo").text("Use corner buttons to share, delete, and modify iotas");
        $("#editInfo").append($('<div>', { class: 'pink-button', id:'onboard-button', text: 'got it', onclick: 'onboardComplete()' }));
        $("#editInfo").fadeIn();
    });
}
function onboardComplete() {
    $("html").removeClass("stop-scroll");
    $(".curtain").fadeOut();
}
/* -------------------- */

/* ----------------- */
/* ---- Posting ---- */
/* ----------------- */
$(".post-iota-field").focusout(function() {
    // Use a very short delay so that the confirm button can actually be clicked
    setTimeout(function() {
        $(".post-iota-field").animate({ width: "0px", opacity: 0.0, padding: "0px", "border-width": "0px" }, 250);
        $("#confirm-iota-button").fadeOut(150, function() {
            $("#post-iota-button").fadeIn(150);
        });
    }, 50);
});
$(".post-iota-field").keypress(function (e) {
/* Code to post iota on enter key
 var key = e.which;
 if(key == 13)  { confirmIota() }
*/
});

function confirmIota() {
    window.location.replace("/"+$(".post-iota-field").val());
}

function postIotaBox() {
    $("#post-iota-button").fadeOut(150, function() {
        $("#confirm-iota-button").fadeIn(150);
    });
    $(".post-iota-field").css("border-width", "1px");
    $(".post-iota-field").animate({ width: $(".contents").width() - 120, opacity: 1.0, padding: "20px"  }, 250);
    $(".post-iota-field").focus();
}
/* --------------- */

/* ------------------ */
/* ----- Search ----- */
/* ------------------ */
function searchContent() {
    var query = $('#search').val();
    var regex = new RegExp(query, 'i');
    var count = 0;
    $(".content-box").each(function() {
        if($(this).attr("content").match(regex) || $(this).attr("title").match(regex)) {
          $(this).show();
          count += 1;
        } else {
          $(this).hide();
        }
    }).promise().done( function() {
        if(query !== "" && query !== null && query !== undefined)
            $(".search-results").text("Displaying " + count + " results");
        else
            $(".search-results").text("");
        nextPage();
    });  
}
$('#search').on('input propertychange paste', searchContent);
/* --------------- */


/* -------------------- */
/* ------ Loading ----- */
/* -------------------- */
function getContent() {
    if(!moreContent)
        return;
    
    $(".loading").toggleClass("hidden");
    $.post("/content", { page: currentPage }, function(data) {
        data = JSON.parse(data);
        console.log(data);
        if(data["content"].length == 0) {
            moreContent = false;
            $(".loading").toggleClass("hidden");
            return;
        }
        for(var i = 0; i < data["content"].length; ++i) {
            if(data["content"][i] === null)
                continue;
            $(".contents").append(createContent(data["content"][i], data["contentid"][i], data["title"][i], data["img"][i]));
        }
        $(".loading").toggleClass("hidden");
        
        $('.image-screen').unbind("click");
        $('.image-screen').click(function() {
              var imgSrc = $(this).siblings(".content-image").attr('src');
              
              $('body').append($('<div>', { class: 'curtain' }).append($('<img>', { class: 'image-expand', src: imgSrc })).click(function() {
                $('.curtain').remove();
              }));
        });
        searchContent();
    });
    currentPage += 1;
}
/* -------------------- */

function shareWindow(url) { window.open(url, 'shareWin', 'left=20,top=20,width=900,height=600,toolbar=1,resizable=0'); }

function createContent(content, contentid, title, img) {
    var result = "";
    var contentHTML = "";
    var boxType = "";
    var attr = "";
    var linkTitle = title === null ? "" : title;
    
    var shareHTML = shareTemplate( { contentid: contentid, content: content } );
    var contentActions = contentActionsTemplate( { contentid: contentid } );
            
    if(content.indexOf(".jpg") > -1 || content.indexOf(".jpeg") > -1 || content.indexOf(".gif") > -1 || content.indexOf(".png") > -1) {
        // -- IMAGE CONTENT --
        boxType  = "content-half";
        contentHTML = "<div class=\"image-screen\"></div><img class=\"content-image\" src=\""+content+"\">";
    } else {
        // Check if it's a URL by existence of title
        if(title !== null) {
            // CHECK FOR VIDEO
            var regexYoutube = new RegExp(/((youtube\.com\/watch\?v=)|(youtu\.be\/))(.{11})/i);
            var youtubeMatch = regexYoutube.exec(content);
            var regexVimeo = new RegExp(/vimeo.com\/(.{8})/i);
            var vimeoMatch = regexVimeo.exec(content);
            if(youtubeMatch !== null || vimeoMatch !== null) {
                // -- VIDEO CONTENT --
                boxType = "content-half";
                thumbClass = "with-thumb";
               

                if(youtubeMatch !== null)
                  attr += "embed=\"https://www.youtube.com/embed/"+youtubeMatch[4]+"\" ";
                else if (vimeoMatch !== null)
                  attr += "embed=\"https://player.vimeo.com/video/"+vimeoMatch[1]+"\" ";
                
                imgHTML = "<div class=\"perma-image-screen\"></div><img class=\"content-image\" src=\""+img+"\">";
                contentHTML = "<div class=\"content-iota content-link with-thumb\" onclick=\"playVideo("+contentid+")\"><div class=\"content-link-title\">" + linkTitle + "<div class=\"play-button\"><span class=\"genericon genericon-play\"></span></div></div></div>"+imgHTML+"";
            } else {
                // -- LINK CONTENT --
                boxType = "content-full";
                var link = content.indexOf("http") < 0 ? "http://"+content : content;
                var imgHTML = "";
                var thumbClass = "";
                if(img != null) {
                    imgHTML = "<div class=\"perma-image-screen\"></div><img class=\"content-image\" src=\""+img+"\">";
                    thumbClass = "with-thumb";
                }
                contentHTML = "<a href=\""+link+"\" target=\"_blank\"><div class=\"content-iota content-link "+thumbClass+"\"><div class=\"content-link-title\">" + linkTitle + "</div><br /><div class=\"link-url\">" + escapeHtml(decodeURI(content)) + "</div></div></a>"+imgHTML+"";
            } "+thumbClass+"
                
        } else {
            // -- TEXT CONTENT --
            boxType = "content-full";
            try {
                contentHTML = "<div class=\"content-iota\">" + escapeHtml(decodeURI(content)) + "</div>";
            } catch(e) {
                console.log(e);
                return "";
            }
        }
    }
    return "<div class=\"content-box "+boxType+"\" id=\"content-"+contentid+"\" contentid=\""+contentid+"\" content=\""+content+"\" title=\""+linkTitle+"\" "+attr+"><div class=\"content\">"+ contentActions + contentHTML + "</div>" + shareHTML+"</div>";
}


function deleteContent(id) {
    $("#content-"+id).fadeOut();
    $.post("/remove", { contentid: id });
}

function openActions(id) {
    $(".content").fadeIn();
    $(".share-buttons").fadeOut();
    
    var content = $("#content-"+id);
    content.children(".content").fadeOut();
    var share = content.children(".share-buttons");
    share.toggleClass("front");
    share.fadeIn();
    if(content.hasClass("content-full"))
        $("#content-"+id).css("height", "125px");
    return false;
}

function closeActions(id) {
    var content = $("#content-"+id);
    content.children(".content").fadeIn();
    var share = content.children(".share-buttons");
    share.toggleClass("front");
    share.fadeOut();
    if(content.hasClass("content-full"))
        $("#content-"+id).css("height", "auto");
    return false;
}

function playVideo(id) {
    var contentBox = $("#content-"+id);
    var embed = contentBox.attr("embed");
    contentBox.switchClass("content-half", "content-media", 250);
    contentBox.html('<div class="hidden">'+contentBox.html()+'</div><iframe id="ytplayer" type="text/html" src="'+embed+'" width="100%" height="330px" frameborder="0" allowfullscreen/><a href="#!" class="hover-pink" onclick="closeVideo('+id+')">close</a>');
}

function closeVideo(id) {
    var contentBox = $("#content-"+id);
    contentBox.html(contentBox.children(".hidden").html());
    contentBox.switchClass("content-media", "content-half", 250);
}

function nextPage() {
    if (  document.documentElement.clientHeight + $(document).scrollTop() >= document.body.offsetHeight )
    { 
        getContent();
        return true;
    }
    return false;
}

$(window).scroll(nextPage);
//$(window).change(nextPage());