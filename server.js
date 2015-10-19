var http = require('http');
var https = require('https');
var fs = require('fs');
var URL = require('url');
var mysql = require('mysql');
var cookies = require('cookies');
var request = require('request');
var bcrypt = require('bcrypt');
var connect = require('connect');
var bodyParser = require('body-parser');
var cheerio = require('cheerio');
var imgur = require('imgur-node-api');
var JSZip = require("jszip");
var Promise = require('promise');
var mime = require('mime');
var nodemailer = require("nodemailer");
var cql = require('cassandra-driver');
var sqlconfig = require('./sql-config.json');

// Cookie lifetime
var cookieLife = 31104000000;

var salt = 10;

// Set up mailer
var transporter = nodemailer.createTransport({
    port: 465,
    host: 'smtp.zoho.com',
    secure: true,
    auth: {
        user: 'nate@iota.ly',
        pass: 'Earlgreyallday1'
    }
});

//Cassandra Connect
//var client = new cql.Client({contactPoints: ['127.0.0.1'], keyspace: 'mykeyspace'});

/*client.execute('SELECT fname, lname FROM users where user_id=?', [1745],
  function(err, result) {
    if (err) console.log('execute failed:' + err);
    else console.log('got user profile with name %s %s', result.rows[0].fname, result.rows[0].lname);
  }
);*/

// Setup Connect
var app = connect();
app.use(bodyParser.urlencoded( { extended : true } ));

/* HTTPS options
var options = {
  key: fs.readFileSync('server.key'),
  cert: fs.readFileSync('server.crt')
};
*/

// Spam prevention
var posts = {};
setInterval(function() {
    for (var ip in posts)
      delete posts[ip];
}, 60000);

// Key used for Google Cloud Messaging
var gcmkey = 'AIzaSyAoTOSBwxuXoDKiJ4sV7IKDWXeiGGxHEvQ';

// Imgur
imgur.setClientID("0bc71bb09c764b2");

/* Set up mysql connection -- TEST SERVER */
var connection = mysql.createConnection(sqlconfig); 
connection.connect();

var regexYoutube = new RegExp(/((youtube\.com\/watch\?v=)|(youtu\.be\/))(.{11})/i);
var regexVimeo = new RegExp(/vimeo.com\/(.{8})/i);

console.log("Starting server...");

// Main request handler
app.use(function (req, res) {
  var url = URL.parse(req.url, true);
  var pathname = url.pathname;
  var addr = req.connection.remoteAddress;
  
  if(fs.existsSync("client" + pathname)) {
    try {
      var file = fs.readFileSync("client" + pathname);
      res.setHeader("Content-Type", mime.lookup(pathname));
      res.writeHead(200);
      return res.end(file, 'binary');
    } catch(err) {
      console.log(err);
    }
  }

  switch(pathname) {
      
    case "/verification":
      return verification(url, req, res);
   
    case "/auth": 
      return auth2(url, req, res);
      
    case "/registerWeb":
      return registerWeb(url, req, res);
  
    case "/forgot":
      return writePage(res, "client/forgot.html");
      
    case "/login":
      return login(url, req, res);

    case "/logout":
      return logout(url, req, res);

    case "/content":
      return content(url, req, res);
      
    case "/ggrp":
      return getGroups(url, req, res);
      
    case "/ggc":
      return groupContent(url, req, res);
    
    case "/register":
      return writePage(res, "client/register.html");
      
    case "/settings":
      return settings(url, req, res);
      
    case "/about":
      return about(url, req, res);
      
    case "/remove":
      return remove(url, req, res);
      
    case "/post":
      return post(url, req, res);
      
    case "/addgroup":
      return addGroup(url, req, res);
      
    case "/iota-images.zip":
      return downloadImages(url, req, res);
      
    case "/favicon.ico":
      var img = fs.readFileSync('client/img/favicon.ico');
      res.writeHead(200);
      return res.end(img, 'binary');
    
    case "undefined":
      return res.end();
      
    case "/undefined":
      return res.end();
      
    case "null":
      return res.end();
  
    case "/null":
      return res.end();
      
    default:
      break;
  }
  
  // All other requests
  var cookie = new cookies( req, res, null );
  var email = cookie.get("email");
  var pw = cookie.get("pw");
  console.log('Cookies: ' + email);
  if(email === undefined || pw === undefined) {
    // No user logged in, check whether to do a content-login
    if(url.query['q'] !== null && url.query['q'] !== undefined) {
      return writePage(res, "client/login-content.html?q="+url.query['q']);
    } else {
      if(pathname === "/")
        return writePage(res, "client/login.html");
      else {
        res.writeHead( 302, { "Location": "/?q="+pathname.slice(1) } );
        return res.end();
      }
    }
  }
  
  // User logged in, check that user is verified
  connection.query("SELECT * FROM users WHERE email = " + esc(email), function(err, rows) {
    if(err) {
      console.log(err);
      return;
    }
    if(rows.length < 1) return res.end("No account found.");
    
    var verif = rows[0]["verification"];
    if(verif != "VERIFIED"){
      return writePage(res, "client/not-verified.html");
    }
    else {
      // If verified, proceed as normal.
      email = email.replace("%40", "@");
      if(pathname === "/") {
        // Index page
        return writePage(res, "client/index.html");
      }
    
      // Do some spam prevention
      if(posts[addr] === undefined || posts[addr] === null) {
        posts[addr] = 1;
      } else {
        posts[addr] = posts[addr] + 1;
        if(posts[addr] > 5) {
          // Stop spamming!
           res.writeHead(200);
           res.write("You are posting too much! Try again in a few minutes.");
           return res.end();
        }
      }
      
      
      // Redirect and process stringlet
      var stringlet = req.url.slice(1);
      /*
      if(stringlet.indexOf('http') == 0) {
        res.writeHead( 302, { "Location": stringlet } );
      } else {
        res.writeHead( 302, { "Location": "/" } );
      }
      */
      res.writeHead( 302, { "Location": "/" } );
      
      console.log("User " + email + " (" + addr + ") posting stringlet: " + stringlet);
      
      connection.query('SELECT * FROM users \
                        WHERE email=' + esc(email),
                        function(err, rows, fields) {
        if(err) { 
          console.log(err); 
          return res.end();
        } else {
          if(rows[0] === undefined || !bcrypt.compareSync(pw, rows[0]['password'])) {
            // Login info is invalid.
            res.writeHead( 302, { "Location": "/" } );
            return res.end();
          }
          
          // Post stringlet
          var userid = rows[0]['userid'];
          var rids = [];
          connection.query('SELECT * FROM devices \
                            WHERE userid=' + esc(userid),
                            function(err, rows, fields) {
                              if(err) { 
                                console.log(err); 
                                return res.end();
                              } 
                              rows.forEach(function(row) {
                                rids.push(row['rid']);
                              });
                              postStringlet(userid, rids, stringlet, res);
                            });
          
        }
      });
    }
  });
  
});

// HTTPS Not supported!
// https.createServer(options, app).listen(process.env.PORT, process.env.IP);

http.createServer(app).listen(process.env.PORT, process.env.IP);

console.log("Server ready.");

/*
  0 - Link
  1 - Image
  2 - Video
  3 - Text
*/
function postStringlet(userid, rids, stringlet, res) {
  // Determine content title and preview image
  var urlregex = new RegExp(/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{2,256}\.[a-z]{2,6}\b([-a-zA-Z0-9@:%_\+.~#?&//=]*)/);
  if(urlregex.test(stringlet)) {
    var title = "none";
    var img = "none";
    var requrl = stringlet;
    var contentType = 0;
    if(stringlet.indexOf("http") < 0)
      requrl = "http://" + stringlet;
      
    var youtubeMatch = regexYoutube.exec(requrl);
    var vimeoMatch = regexVimeo.exec(requrl);
    
    if(requrl.indexOf(".jpg") >= 0 || requrl.indexOf(".jpeg") >= 0 || requrl.indexOf(".png") >= 0 || requrl.indexOf(".gif") >= 0) {
      // Image URL, upload to imgur if not already hosted there.
      if(requrl.indexOf("imgur") < 0)
        imgur.upload(requrl, function(err, imgres) {
          contentType = 1;
          if(err) { 
            console.log(err); 
            return res.end();
          } 
          else connection.query('INSERT INTO content(`userid`, `content`,`postdate`, `contentType`) VALUES (' +
                                userid + ', ' +  esc(imgres.data.link) + ', LOCALTIME(), \"'+contentType+'\");');
          res.end();
        });
      else {
        connection.query('INSERT INTO content(`userid`, `content`,`postdate`, `contentType`) VALUES (' +
                                userid + ', ' +  esc(requrl) + ', LOCALTIME(), \"'+contentType+'\");');
          res.end();
      }
    } else {
        // Post new stringlet into content db
        if(youtubeMatch !== null || vimeoMatch !== null)
          contentType = 2;
        connection.query('INSERT INTO content(`userid`, `content`,`postdate`, `contentType`) VALUES (' +
                          userid + ', ' +  esc(stringlet) + ', LOCALTIME(), \"'+contentType+'\");');
          res.end();
    }
    
    request(requrl, function (error, response, body) {
      if(error) console.log(error);
      var $;
      try {
        $ = cheerio.load(body);
      } catch(err) {
        console.log(err);
        return;
      }
      connection.query("UPDATE content SET title="+esc($("title").text())+" WHERE content="+esc(stringlet));
      // If YouTube link, get video preview. Otherwise scrape images.
      if(youtubeMatch !== null) {
        img = "http://img.youtube.com/vi/"+youtubeMatch[4]+"/0.jpg";
        connection.query("UPDATE content SET img="+esc(img)+" WHERE content="+esc(stringlet));
      } else {
        $("img").each(function() {
          try {
            var srcImg = $(this).attr("src");
            if((srcImg.indexOf("http") >= 0 || srcImg.indexOf("https") >= 0) && srcImg.indexOf(".jpg") >= 0 || srcImg.indexOf(".jpeg") >= 0 || srcImg.indexOf(".png") >= 0 || srcImg.indexOf(".svg") >= 0) {
              connection.query("UPDATE content SET img="+esc(srcImg)+" WHERE content="+esc(stringlet));
              return false;
            }
          } catch(err) {
            console.log(err);
            return;
          }
        });
      }
    });
  } else {
    // Post new stringlet into content db
    connection.query('INSERT INTO content(`userid`, `content`,`postdate`, `contentType`) VALUES (' +
                      userid + ', ' +  esc(stringlet) + ', LOCALTIME(), \"'+contentType+'\");');
    res.end();
  }
   
                        
  // Send notification to GCM
  var options = {
    method: "POST",
    url : 'https://android.googleapis.com/gcm/send',
    headers: {
        'Content-Type': 'application/json',
        Authorization: 'key='+gcmkey
    },
    body: JSON.stringify ( {
      "data": {
        "stringlet": stringlet
      },
      "registration_ids": rids
    } )
  };
  request.post(options,
      function (error, response, body) {
          // console.log("GCM response: \n" + body);
      }
  );
}

function auth2(url, req, res) {
  var email = req.body.email;
  var pw = req.body.pw;
  var rid = req.body.rid;
  console.log("auth: " + email);
  
  connection.query('SELECT * FROM users \
                    WHERE email=' + esc(email),
                    function(err, rows, fields) {
    console.log(rows);
    res.writeHead(200);
    if (err || rows[0] === undefined) {
      // Auth failed, email not found
      res.write("{ 'result':'failure' }");
      return res.end();
    } else {
      // Check password hash
      var hash = rows[0]['password'];
      if(bcrypt.compareSync(pw, hash)) {
        // Auth succeeded, add RID if not present in db.
        addrid(rid, rows[0]['userid']);
        res.write("{ 'result':'success' }");
        return res.end();
      } else {
        // Auth failed, incorrect password
        res.write("{ 'result':'failure' }");
        return res.end();
      }
    }
  });
}

function registerWeb(url, req, res) {
  var email = req.body.email;
  var pw = req.body.pw;
  var confirm = req.body.confirm;
  console.log("registerWeb: " + email);
  
  //Server-side validation
  /*if(email) {
    res.write("{ 'result':'nothing' }");
    return res.end();
  }*/
  
  console.log("register web:" + email + " // " + pw);
  
  // bcrypt password
  var hash = bcrypt.hashSync(pw, salt);
  var verif = genVerif();
  
  connection.query('SELECT * FROM users \
                    WHERE email=' + esc(email),
                    function(err, rows, fields) {
    console.log(rows);

    if(err) {
      res.write("{ 'result':'failure', 'reason':'"+err+"' }");
      return res.end();
    } else if(rows[0] !== undefined) {
      res.write("{ 'result':'failure', 'reason':'Email already registered.' }");
      return res.end();
    } else if(pw !== confirm) {
      res.write("{ 'result':'failure', 'reason':'Passwords do not match.' }");
      return res.end();
    } else {
      connection.query('INSERT INTO users(`email`,`password`,`verification`) VALUES (' +
                        esc(email)+', '+
                        esc(hash)+', '+
                        esc(verif)+')',
                        function(err, result) { 
                          if (err) {
                            console.log(err);
                            return res.end();
                          }
                          // Add an example iota explaining how to use the service
                          var id = result.insertId;
                          var introText = "\"Hi there! To start using iota, simply type our domain 'iota.ly/' in front of any URL or text you wish to save.\"";
                          connection.query("INSERT INTO content(userid, content, postdate, contentType) VALUES("+id+", "+introText+", LOCALTIME(), 3)");
                        });
                        
        var cookie = new cookies( req, res, null );
        cookie.set('email', email, { httpOnly: false, maxAge: cookieLife });
        cookie.set('pw', pw, { httpOnly: false, maxAge: cookieLife });
        
        sendMail(email, verif);

        res.writeHead( 302, { "Location": "/" } );
        return res.end();
    }
  });
}

function login(url, req, res) {
  var email = req.body.email;
  var pw = req.body.pw;
  var content = req.body.content;
  content = content === undefined ? "" : content;
  
  console.log("login: " + email);
  connection.query('SELECT * FROM users \
                    WHERE email=' + esc(email),
                    function(err, rows, fields) {
    console.log(rows);
    if (err || rows[0] === undefined) {
      // Login failed, email not found
      console.log("email undefined");
      return redirect(res, "login-failed.html?q="+content);
    } else {
      // Check password hash
      var hash = rows[0]['password'];
      console.log("check pw hash");
      if(bcrypt.compareSync(pw, hash)) {
        // Login succeeded
        console.log("login success");
        var cookie = new cookies( req, res, null );
        cookie.set('email', email, { httpOnly: false, maxAge: cookieLife });
        cookie.set('pw', pw, { httpOnly: false, maxAge: cookieLife });
        
        // Post content from login if present, otherwise go home
        return redirect(res, content);
      } else {
        // Login failed, incorrect password
        console.log("incorrect pw");
        return redirect(res, "login-failed.html?q="+content);
      }
    }
  });
}

function redirect(res, location) {
  location = (location === undefined || location === null) ? "" : location;
  res.writeHead( 302, { "Location": "/"+location } );
  return res.end();
}

function logout(url, req, res) {
  var email = req.body.email;
  console.log("logout: " + email);
  
  // Delete login cookies
  var cookie = new cookies( req, res, null );
  cookie.set('email', undefined, { overwrite:true });
  cookie.set('pw', undefined, { overwrite:true });
  res.writeHead( 302, { "Location": "/" } );
  return res.end();
}

// Returns true if added
function addrid(rid, userid) {
  if(rid !== null && rid !== undefined) {
    connection.query('SELECT * FROM devices \
                      WHERE userid=' + userid,
                      function(err, rows, fields) {
      if (err) {
        console.log(err);
        return;
      }
      if(rows[0] !== undefined) {
        // Check for current rid
        rows.forEach(function(row) {
          if(row['rid'] === rid) {
            // Current rid already present
            return false;
          }
        });
      }
      // Current rid not found, add it
      console.log("Adding RID for userid " + userid);
      connection.query('INSERT INTO devices(userid, rid) \
                        VALUES (' + userid +', '+ esc(rid) + ')',
                        function(err, rows, fields) {
                          if (err) {
                            console.log(err);
                            return;
                          }
                        });
      return true;
    });
  }
  return false;
}

function content(url, req, res) {
  var cookie = new cookies( req, res, null );
  var email = cookie.get("email");
  var pw = cookie.get("pw");
  var page = req.body.page;
  var contentPerPage = 20;
  
  if(email === undefined || pw === undefined) {
    // No cookies, grab them from request (app request)
    email = req.body.email;
    pw = req.body.pw;
  }
  email = decodeURIComponent(email);
  console.log("content: " + email);
  
  connection.query('SELECT * FROM users \
                    WHERE email=' + esc(email),
                    function(err, rows, fields) {
    res.writeHead(200);
    if (err || rows[0] === undefined) {
      // Auth failed, email not found
      res.write("{ 'result':'failure', 'reason':'email not found'}");
      return res.end();
    } else {
      // Check password hash
      var hash = rows[0]['password'];
      if(bcrypt.compareSync(pw, hash)) {
        // Auth succeeded, grab userid for content table
        var response = { 'result':'success', 'contentid':[], 'content':[], 'postdate':[], 'title':[], 'img':[]};
        var userid = rows[0]['userid'];
        
        // Get user content
        connection.query('SELECT * FROM content \
                          WHERE userid=' + userid + " ORDER BY contentid DESC LIMIT " + contentPerPage + " OFFSET "+ (page * contentPerPage),
                          function(err, rows, fields) {
          if(err) console.log(err);
          
          for(var i = 0; i < rows.length; i++) {
            response['content'].push(rows[i]['content']);
            response['contentid'].push(rows[i]['contentid']);
            response['postdate'].push(rows[i]['postdate']);
            response['title'].push(rows[i]['title']);
            response['img'].push(rows[i]['img']);
          }
          res.write(JSON.stringify(response));
          return res.end();
        });
      } else {
        // Auth failed, incorrect password
        res.write("{ 'result':'failure', 'reason':'incorrect password' }");
        return res.end();
      }
    }
  });
}

function groupContent(url, req, res) {
  var cookie = new cookies( req, res, null );
  var email = cookie.get("email");
  var pw = cookie.get("pw");
  var gid = parseInt(url.query.gid, 10);
  
  console.log(gid);
  if(email === undefined || pw === undefined) {
    // No cookies, grab them from request (app request)
    email = req.body.email;
    pw = req.body.pw;
  }
  email = decodeURIComponent(email);
  console.log("groupcontentid: " + email);
  
  connection.query('SELECT * FROM users \
                    WHERE email=' + esc(email),
                    function(err, rows, fields) {
    res.writeHead(200);
    if (err || rows[0] === undefined) {
      // Auth failed, email not found
      res.write("{ 'result':'failure', 'reason':'email not found'}");
      return res.end();
    } else {
      // Check password hash
      var hash = rows[0]['password'];
      if(bcrypt.compareSync(pw, hash)) {
        // Auth succeeded, grab userid for content table
        var response = { 'result':'success', 'contentid':[], 'content':[], 'postdate':[]};
        var userid = rows[0]['userid'];
        
        // Get user content
        var query;
        if (gid !== 0){
          query = 'SELECT * FROM groupcontent WHERE groupid=' + gid;
        } else {
          query = 'SELECT * FROM groupcontent WHERE groupid in (SELECT GROUPID FROM groupmembers WHERE USERID=' + userid + ')';
        }
        connection.query(query, function(err, rows, fields) {
          if(err) {
            console.log(err);
            return res.end();
          }
          for(var i = 0; i < rows.length; i++) {
            response['content'].push(rows[i]['content']);
            response['contentid'].push(rows[i]['groupcontentid']);
            response['postdate'].push(rows[i]['postdate']);
          }
          res.write(JSON.stringify(response));
          return res.end();
        });
      } else {
        // Auth failed, incorrect password
        res.write("{ 'result':'failure', 'reason':'incorrect password' }");
        return res.end();
      }
    }
  });
}

function getGroups(url, req, res) {
  var cookie = new cookies( req, res, null );
  var email = cookie.get("email");
  var pw = cookie.get("pw");
  if(email === undefined || pw === undefined) {
    // No cookies, grab them from request (app request)
    email = req.body.email;
    pw = req.body.pw;
  }
  email = decodeURIComponent(email);
  console.log("group: " + email);
  
  connection.query('SELECT * FROM users \
                    WHERE email=' + esc(email),
                    function(err, rows, fields) {
    res.writeHead(200);
    if (err || rows[0] === undefined) {
      // Auth failed, email not found
      res.write("{ 'result':'failure', 'reason':'email not found'}");
      return res.end();
    } else {
      // Check password hash
      var hash = rows[0]['password'];
      if(bcrypt.compareSync(pw, hash)) {
        // Auth succeeded, grab userid for content table
        var response = { 'result':'success', 'groupid':[], 'groupname':[] };
        var userid = rows[0]['userid'];
        
        // Get user content
        connection.query('SELECT * FROM groups \
                          WHERE groupid in (SELECT groupid FROM groupmembers WHERE userid=' + userid + ')',
                          function(err, rows, fields) {
          if(err) {
            console.log(err);
            return res.end();
          }
          for(var i = 0; i < rows.length; i++) {
            response['groupid'].push(rows[i]['groupid']);
            response['groupname'].push(rows[i]['groupname']);
          }
          res.write(JSON.stringify(response));
          return res.end();
        });
      } else {
        // Auth failed, incorrect password
        res.write("{ 'result':'failure', 'reason':'incorrect password' }");
        return res.end();
      }
    }
  });
}

function remove(url, req, res) {
  var cookie = new cookies( req, res, null );
  var email = cookie.get("email");
  var pw = cookie.get("pw");
  if(email === undefined || pw === undefined) {
    // No cookies, grab them from request (app request)
    email = req.body.email;
    pw = req.body.pw;
  }
  email = decodeURIComponent(email);
  var contentid = req.body.contentid;
  console.log("remove: " + email + ", " + contentid);
  
  connection.query('SELECT * FROM users \
                    WHERE email=' + esc(email),
                    function(err, rows, fields) {
                      if(err || rows[0] === undefined || !bcrypt.compareSync(pw, rows[0]['password'])) {
                        console.log(err);
                        res.write("{ 'result':'failure' }");
                        return res.end();
                      }
                      connection.query('DELETE FROM content \
                                        WHERE contentid=' + esc(contentid) +
                                        ' AND userid=' + esc(rows[0]['userid']),
                                        function(err, rows, fields) {
                                          if(!err)
                                            res.write("{ 'result':'success' }");
                                          else  {
                                            console.log(err);
                                            res.write("{ 'result':'failure' }");
                                          }
                                          return res.end();
                                        });
                    });
}

function post(url, req, res) {
  var cookie = new cookies( req, res, null );
  var email = cookie.get("email");
  var pw = cookie.get("pw");
  if(email === undefined || pw === undefined) {
    // No cookies, grab them from request (app request)
    email = req.body.email;
    pw = req.body.pw;
  }
  var stringlet = req.body.stringlet;
  
  connection.query('SELECT * FROM users \
                    WHERE email=' + esc(email),
                    function(err, rows, fields) {
    if (err) {
        console.log(err);
        return res.end();
    } else {
      if(rows[0] === undefined || !bcrypt.compareSync(pw, rows[0]['password'])) {
        // Login info is invalid.
        res.write("{ 'result':'failure' 'reason':'Invalid credentials.' }");
        return res.end();
      }
      
      // Post stringlet
      var userid = rows[0]['userid'];
      var rids = [];
      connection.query('SELECT * FROM devices \
                        WHERE userid=' + esc(userid),
                        function(err, rows, fields) {
                          if(err) console.log(err);
                          rows.forEach(function(row) {
                            rids.push(row['rid']);
                          });
                          postStringlet(userid, rids, stringlet);
                          res.write("{ 'result':'success' }");
                          return res.end();
                        });
    }
  });
}

function settings(url, req, res) {
  var cookie = new cookies( req, res, null );
  var email = cookie.get("email");
  var pw = cookie.get("pw");
  if(email === undefined || pw === undefined) {
    // No cookies, grab them from request.
    return writePage(res, "client/login.html");
  }
  return writePage(res, "client/settings.html");
}

function about(url, req, res) {
  var cookie = new cookies( req, res, null );
  var email = cookie.get("email");
  var pw = cookie.get("pw");
  if(email === undefined || pw === undefined) {
    // No cookies, grab them from request.
    return writePage(res, "client/login.html");
  }
  return writePage(res, "client/about.html");
}

function addGroup(url, req, res) {
  var cookie = new cookies( req, res, null );
  var email = cookie.get("email");
  var pw = cookie.get("pw");
  if(email === undefined || pw === undefined) {
    // No cookies, grab them from request.
    return writePage(res, "client/login.html");
  }
  return writePage(res, "client/groups.html");
}

function downloadImages(url, req, res) {
  var cookie = new cookies( req, res, null );
  var email = cookie.get("email");
  var zip = new JSZip();
  var dir = 'client/zips/'+email+'/';
  console.log("Image download request from " + email);
  
  if(email === undefined)
    return res.end();
  
  if(!fs.existsSync(dir))
    fs.mkdirSync(dir);

  // Get all images of current user
  connection.query("SELECT * FROM users RIGHT JOIN content ON users.userid = content.userid WHERE email="+esc(email)+" AND content.contentType = 1", function(err, rows) {
    var promises = [];
    if(err) {
      console.log(err);
      return res.end(err);
    }
    if(rows.length === 0) {
      // Uh oh! No images under current user.
      return writePage(res, "client/no-images.html");
    }
    
    for(var index = 0; index < rows.length; ++index) {
      // Run zip operations in an anonymous function to keep track of each index
      // otherwise async functions will end up running after the loop 
      // has ended and all still use the original index (which will be invalid)
      (function(i) {
        var img = rows[i].content;
        console.log(img);
        var imageType = "";
        
        // Make sure we have the right file extension (this can 
        // be done more properly with a regex or something)
        if(img.indexOf(".jpg") > 0 || img.indexOf(".jpeg") > 0)
          imageType = ".jpg";
        if(img.indexOf(".png") > 0)
          imageType = ".png";
        if(img.indexOf(".gif") > 0)
          imageType = ".gif";
          
        // We need to create promises here so we know when all files are done
        // being zipped.
        if(content)
        promises.push(new Promise(function(resolve, reject) {
          console.log("Getting image " + i+imageType + "...");
          request(rows[i].content).pipe(fs.createWriteStream(dir+i+imageType)).on('close', function() {
            console.log("Adding " + i+imageType + " to zip...");
            try {
              zip.file(i+imageType, fs.readFileSync(dir+i+imageType));
              resolve();
            } catch(err) {
              console.log(err);
              reject();
            }
          });
        }));
      })(index);
    }
    
    // When the zip file is ready, we send it. If any of the images cannot be
    // zipped the promise will not fire. Eventually we should check for that.
    Promise.all(promises).then(function() {
      console.log("Done adding files. Responding with zip...");
      res.end(zip.generate({type:"nodebuffer"}), 'binary');
      deleteFolderRecursive(dir);
    });
  });
  
}

function verification(url, req, res){
  var cookie = new cookies( req, res, null );
  var email = cookie.get("email");
  var pw = cookie.get("pw");
  
  if(email === undefined || pw === undefined) {
    // No cookies, grab them from request (app request)
    email = req.body.email;
    pw = req.body.pw;
  }
  email = decodeURIComponent(email);
  console.log("content: " + email);
  
  connection.query('SELECT * FROM users \
                    WHERE email=' + esc(email),
                    function(err, rows, fields) {
    res.writeHead(200);
    if (err || rows[0] === undefined) {
      // Auth failed, email not found
      res.write("{ 'result':'failure', 'reason':'email not found'}");
      return writePage(res, "client/login.html");
    } else {
      // Check password hash
      var hash = rows[0]['password'];
      if(bcrypt.compareSync(pw, hash)) {
        // Auth succeeded, begin verification
        var verified = rows[0]['verification'];
        
        if (verified != 'VERIFIED') {
          if (url.query['q'] !== null && url.query['q'] !== undefined){
            if (verified == url.query['q']) {
              connection.query('UPDATE users SET verification = "VERIFIED" WHERE ' +
                        'email = ' + esc(email),
                        function(err, result) { 
                          if (err) {
                            //Need better error handling
                            console.log(err);
                            return res.end();
                          }
                        });
              
              return writePage(res, "client/index.html");
            } else 
              return writePage(res, "client/not-verified.html");
          } else 
            return writePage(res, "client/not-verified.html");
        } else 
          return writePage(res, "client/index.html");
        
      } else {
        // Auth failed, incorrect password
        res.write("{ 'result':'failure', 'reason':'incorrect password' }");
        return writePage(res, "client/login.html");
      }
    }
  });
}


function writePage(res, path) {
  fs.readFile(path, 'binary', function(err, file) {
    if(err) {  
      res.writeHead(500, {"Content-Type": "text/plain"});
      res.write(err + "\n");
      res.end();
      return;
    }
    
    res.writeHead(200);
    res.write(file, "binary");
    res.end();
    return;
  });
}

function deleteFolderRecursive(path) {
  if( fs.existsSync(path) ) {
    fs.readdirSync(path).forEach(function(file,index){
      var curPath = path + "/" + file;
      if(fs.lstatSync(curPath).isDirectory()) { // recurse
        deleteFolderRecursive(curPath);
      } else { // delete file
        fs.unlinkSync(curPath);
      }
    });
    fs.rmdirSync(path);
  }
};

function esc(str) { return connection.escape(str); }

function genSalt() {
  return (new Date()).getTime();
}

function genVerif() {
  var code = "";
  var possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

  for( var i=0; i < 20; i++ )
      code += possible.charAt(Math.floor(Math.random() * possible.length));

  return code;
}

function sendMail(email, verifCode) {
  console.log("Sending mail...");
  transporter.sendMail({
    from: 'nate@iota.ly',
    to: email,
    subject: 'Activate your iota account',
    text: 'Click this link to start using iota: http://iota.ly/verification?q=' + verifCode
  }, function(error, info) {
    console.log("Mail sent.");
    if(error) console.log(error);
    else console.log(info.response);
  });
}