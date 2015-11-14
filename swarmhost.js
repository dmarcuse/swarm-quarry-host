/******************
 *  Basic Config   *
 ******************/

// Logging levels:
// 0 - no logging
// 1 - low logging - log important events (swarm creation, swarm completion, etc) and errors
// 2 - high logging - log almost everything
// 3 - max logging - log everything
// default: 1
var logging = 1;

// Authentication
// Since this is stored in plain text, do not use a password you use elsewhere - this is
//  intended to be a BASIC authentication system and is NOT secure!
// Set to an empty string to disable authentication
var auth_token = "";

/******************
 * Advanced Config *
 ******************/

// JSON data file
// The file that JSON will be read from and written to
// default: data.json
var dbfile = "data.json";

// Port to run on
// default: PORT environment variable or 8080
var port = process.env.PORT || 8080;

// IP Locking
// If true, will only allow commands to be run by the IP that created the specified swarm
// This can be used to mitigate 'griefing' by controlling someone's swarm
// default: true
var iplock = true;

/******************
 *       Code      *
 *  Don't change!  *
 ******************/

var express = require("express");
var fs = require("fs");
var jsf = require("jsonfile");

var app = express();

var db;

function savedb() {
    jsf.writeFile(dbfile, db, function(e) {
        if (e && logging >= 1) console.error("WARNING - Error writing database: " + e);
    });
}

// Initialize database
if (logging >= 2) console.log("Loading database");
try {
    fs.lstatSync(dbfile);
    db = jsf.readFileSync(dbfile);
}
catch (e) {
    // File missing or invalid json
    if (logging >= 1) console.log("WARNING - Database file missing or corrupt - creating empty DB");
    db = {};
    savedb();
}

var handlers = {};

handlers.common = function(req, res) {
    var ip = req.headers['x-forwarded-for'] ||
        req.connection.remoteAddress ||
        req.socket.remoteAddress ||
        req.connection.socket.remoteAddress;
    if (logging >= 3) console.log(ip + " requested " + req.url);
};

handlers.root = function(req, res) {
    handlers.common(req, res);
    res.send("This is a placeholder!");

};

handlers.swarmlist = function(req, res) {
    handlers.common(req, res);
    //res.send("swarm list requested")
    var ip = req.headers['x-forwarded-for'] ||
        req.connection.remoteAddress ||
        req.socket.remoteAddress ||
        req.connection.socket.remoteAddress;
    res.send({
        success: Object.keys(db)
    });
    if (logging >= 2) console.log(ip + " requested swarm list");
};

handlers.swarminfo = function(req, res) {
    handlers.common(req, res);
    res.send("swarm info requested");
};

handlers.swarmcommand = function(req, res) {
    handlers.common(req, res);
    //res.send("swarm command requested");
    var ip = req.headers['x-forwarded-for'] ||
        req.connection.remoteAddress ||
        req.socket.remoteAddress ||
        req.connection.socket.remoteAddress;
    switch (req.params.swarmcommand) {
        // create a new swarm entry in the database
        case "create":
            {
                if (auth_token && auth_token != req.query.token) {
                    res.send({
                        error: "invalid token"
                    });
                    break;
                }
                if (db[req.params.swarmid]) {
                    res.send({
                        error: "swarm exists"
                    });
                    break;
                }
                if (!req.query.w || !req.query.h) {
                    res.send({
                        error: "missing parameters"
                    });
                    break;
                }
                db[req.params.swarmid] = {};
                var temp = {};
                temp.time_created = new Date().getTime();
                temp.w = req.query.w;
                temp.h = req.query.h;
                temp.ip = ip;
                // generate shaft list
                temp.shafts = [];
                for (var i = 0; i <= req.query.w; i++) {
                    for (var j = 0; j <= req.query.h; j++) {
                        if (((i % 5) * 2 + j) % 5 == 0) temp.shafts.push({
                            x: i,
                            z: j
                        });
                    }
                }
                temp.claimed = [];
                temp.done = [];
                db[req.params.swarmid] = temp;
                savedb();
                res.send({
                    success: "swarm created",
                    shafts: db[req.params.swarmid].shafts.length
                });
                if (logging >= 1) console.log(ip + " created swarm '" + req.params.swarmid + "'");
                break;
            }

        // claim a shaft for a turtle
        case "claimshaft":
            {
                if (auth_token && auth_token != req.query.token) {
                    res.send({
                        error: "invalid token"
                    });
                    break;
                }
                if (iplock && ip != db[req.params.swarmid].ip) {
                    res.send({
                        error: "ip mismatch"
                    });
                    break;
                }
                if (!db[req.params.swarmid]) {
                    res.send({
                        error: "swarm does not exist"
                    });
                    break;
                }
                if (!req.query.id) {
                    res.send({
                        error: "missing parameters"
                    });
                    break;
                }
                var shaft = db[req.params.swarmid].shafts.shift();
                if (shaft) {
                    res.send({
                        success: shaft,
                        done: (db[req.params.swarmid].shafts.length == 0)
                    });
                    shaft.claimed_time = new Date().getTime();
                    shaft.claimed_by = req.query.id;
                    db[req.params.swarmid].claimed.push(shaft);
                    if (logging >= 2) console.log("Shaft (" + shaft.x + ", " + shaft.z + ") claimed in swarm '" + req.params.swarmid + "' by turtle " + req.query.id);
                    savedb();
                    break;
                }
                else {
                    res.send({
                        error: "no remaining shafts",
                        done: true
                    });
                    break;
                }
            }

        // mark a shaft as finished
        case "finishedshaft":
            {
                if (auth_token && auth_token != req.query.token) {
                    res.send({
                        error: "invalid token"
                    });
                    break;
                }
                if (iplock && ip != db[req.params.swarmid].ip) {
                    res.send({
                        error: "ip mismatch"
                    });
                    break;
                }
                if (!db[req.params.swarmid]) {
                    res.send({
                        error: "swarm does not exist"
                    });
                    break;
                }
                if (!(req.query.x && req.query.z)) {
                    res.send({
                        error: "missing parameters"
                    });
                    break;
                }
                var x = Number(req.query.x);
                var z = Number(req.query.z);
                var index = -1;
                for (var i = 0; i <= db[req.params.swarmid].claimed.length; i++) {
                    var tmpshaft = db[req.params.swarmid].claimed[i];
                    if (tmpshaft && tmpshaft.x == x && tmpshaft.z == z) {
                        index = i;
                        break;
                    }
                }
                if (index != -1) {
                    var shaft = db[req.params.swarmid].claimed.splice(index, 1)[0];
                    shaft.completed_time = new Date().getTime();
                    db[req.params.swarmid].done.push(shaft);
                    res.send({
                        success: true
                    });
                    if (logging >= 2) {
                        console.log("Shaft (" + shaft.x + ", " + shaft.z + ") finished in swarm '" + req.params.swarmid + "' by turtle " + shaft.claimed_by);
                    }
                    savedb();
                    break;
                }
                else {
                    res.send({
                        error: "shaft not found"
                    });
                    break;
                }
            }

        default:
            {
                res.send({
                    error: "unrecognized command"
                });
                break;
            }
    }
};

// Web CP (todo)
app.get('/', handlers.root);
// Swarm List
app.get('/swarm/', handlers.swarmlist);
// Info about specified swarm
app.get('/swarm/:swarmid/', handlers.swarminfo);
// Run a command on specified swarm
app.get('/swarm/:swarmid/:swarmcommand/', handlers.swarmcommand);

var server = app.listen(port, function() {
    var host = server.address().address;
    var port = server.address().port;

    if (logging >= 1) console.log('Running swarm quarry host at port %s', port);
});
