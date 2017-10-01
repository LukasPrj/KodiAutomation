// server.js
// where your node app starts

// init project
require('dotenv').load();
var express = require('express');
var app = express();

var Fuse = require('fuse.js')
var Kodi = require('./kodi-connection/node.js');
var kodi = new Kodi(process.env.KODI_IP, process.env.KODI_PORT, process.env.KODI_USER, process.env.KODI_PASSWORD);
var youtubeUrl = process.env.YOUTUBE_URL;
var YoutubeRequest = '{"maxResults": "1",' + 
                 '"part":"snippet",' +
                 '"q": "dummy",' +
                 '"type": "video"}';
var fetch = require('node-fetch');
// Set option for fuzzy search
var fuzzySearchOptions = {
  caseSensitive: false, // Don't care about case whenever we're searching titles by speech
  includeScore: false, // Don't need the score, the first item has the highest probability
  shouldSort: true, // Should be true, since we want result[0] to be the item with the highest probability
  threshold: 0.4, // 0 = perfect match, 1 = match all..
  location: 0,
  distance: 100,
  maxPatternLength: 64,
  keys: ['label']
}

app.use(express.static('public'));

var fs = require('fs');
var readline = require('readline');
var google = require('googleapis');
var googleAuth = require('google-auth-library');

// If modifying these scopes, delete your previously saved credentials
// at ~/.credentials/youtube-nodejs-quickstart.json
var SCOPES = ['https://www.googleapis.com/auth/youtube.readonly'];
var TOKEN_DIR = (process.env.HOME || process.env.HOMEPATH ||
    process.env.USERPROFILE) + '/.credentials/';
var TOKEN_PATH = TOKEN_DIR + 'youtube-nodejs-quickstart.json';

fs.readFile('client_secret.json', function processClientSecrets(err, content) {
  if (err) {
    console.log('Error loading client secret file: ' + err);
    return;
  }
  // Authorize a client with the loaded credentials,
  var credentials = JSON.parse(content);
  var clientSecret = credentials.installed.client_secret;
  var clientId = credentials.installed.client_id;
  var redirectUrl = credentials.installed.redirect_uris[0];
  var auth = new googleAuth();
  var oauth2Client = new auth.OAuth2(clientId, clientSecret, redirectUrl);
    // Check if we have previously stored a token.
  fs.readFile(TOKEN_PATH, function(err, token) {
    if (err) {
      getNewToken(oauth2Client);
    } else {
      oauth2Client.credentials = JSON.parse(token);
    } 
   });
});

var searchYoutubeMovie = function(criteria) {
// Load client secrets from a local file.
fs.readFile('client_secret.json', function processClientSecrets(err, content) {
  if (err) {
    console.log('Error loading client secret file: ' + err);
    return;
  }
  // Authorize a client with the loaded credentials, then call the YouTube API.
  return authorize(JSON.parse(content), searchYoutube, criteria);
})
};

/**
 * Create an OAuth2 client with the given credentials, and then execute the
 * given callback function.
 *
 * @param {Object} credentials The authorization client credentials.
 * @param {function} callback The callback to call with the authorized client.
 */

function authorize(credentials, callback, criteria) {
  var clientSecret = credentials.installed.client_secret;
  var clientId = credentials.installed.client_id;
  var redirectUrl = credentials.installed.redirect_uris[0];
  var auth = new googleAuth();
  var oauth2Client = new auth.OAuth2(clientId, clientSecret, redirectUrl);

  // Check if we have previously stored a token.
  fs.readFile(TOKEN_PATH, function(err, token) {
    if (err) {
      getNewToken(oauth2Client, callback);
    } else {
      oauth2Client.credentials = JSON.parse(token);
      callback(oauth2Client,criteria);
    }
  });
}

/**
 * Get and store new token after prompting for user authorization, and then
 * execute the given callback with the authorized OAuth2 client.
 *
 * @param {google.auth.OAuth2} oauth2Client The OAuth2 client to get token for.
 * @param {getEventsCallback} callback The callback to call with the authorized
 *     client.
 */
function getNewToken(oauth2Client, callback) {
  var authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES
  });
  console.log('Authorize this app by visiting this url: ', authUrl);
  var rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  rl.question('Enter the code from that page here: ', function(code) {
    rl.close();
    oauth2Client.getToken(code, function(err, token) {
      if (err) {
        console.log('Error while trying to retrieve access token', err);
        return;
      }
      oauth2Client.credentials = token;
      storeToken(token);
      if(callback && typeof callback == "function") {
      callback(oauth2Client);
      }
   });
  });
}

/**
 * Store token to disk be used in later program executions.
 *
 * @param {Object} token The token to store to disk.
 */
function storeToken(token) {
  try {
    fs.mkdirSync(TOKEN_DIR);
  } catch (err) {
    if (err.code != 'EEXIST') {
      throw err;
    }
  }
  fs.writeFile(TOKEN_PATH, JSON.stringify(token));
  console.log('Token stored to ' + TOKEN_PATH);
}

/**
 * Lists the names and IDs of up to 10 files.
 *
 * @param {google.auth.OAuth2} auth An authorized OAuth2 client.
 */
function searchYoutube(auth,q) {
  var service = google.youtube('v3');
  service.search.list({
    auth: auth,
    part: 'snippet',
    q: q,
    maxResults: '1',
    type: 'video'	
  }, function(err, response) {
    if (err) {
      console.log('The API returned an error: ' + err);
      return;
    }
    var movies = response.items;
    if (movies.length == 0) {
      console.log('No movie found.');
      return;
    } else {
      var movie = movies[0]["id"];
      console.log("Identified movie = " + JSON.stringify(movie));
      var movieid = JSON.stringify(movie["videoId"]).trim();
      var videoId = new String();
      videoId = movieid.toString().replace(/"/g, "");
      console.log("Identified movieid = " + videoId);
      playYoutube(videoId); 
   }
  });
}

var validateRequest = function(req, res, processRequest){
  var jsonString = '';
  var requestToken = '';
  var jsonBody;

  if (req == null || req.query == req) {
    console.log("403 - Unauthorized request");
    res.sendStatus(403);
    return;
  }
  
  req.on('data', function (data) {
      jsonString += data;
  });
  req.on('end', function () {
    if (jsonString != '') {
      jsonBody = JSON.parse(jsonString);
      if (jsonBody != null) {
        requestToken = jsonBody['token'];
        console.log("Request token = " + requestToken);
        if (requestToken == process.env.AUTH_TOKEN) {
          console.log("Authentication succeeded");
          processRequest(req, res);
          return;
        }
      }
    }
    console.log("401 - Authentication failed");
    res.sendStatus(401);
  });
};

// Pause or Resume video player
app.get("/playpause", function (request, response) {
  validateRequest(request, response, kodiPlayPause)
});


// Sets the volume to required input
app.get("/setvolume", function (request, response) {
  validateRequest(request, response, kodiSetVolume)
});

// Mutes kodi
app.get("/mute", function (request, response) {
  validateRequest(request, response, kodiMute)
});

// Unmutes kodi
app.get("/unmute", function (request, response) {
  validateRequest(request, response, kodiUnmute)
});

// Increases the volume by input
app.get("/increasevolume", function (request, response) {
  validateRequest(request, response, kodiIncreaseVolume)
});

// Decrease the volume by input
app.get("/decreasevolume", function (request, response) {
  validateRequest(request, response, kodiDecreaseVolume)
});

// Mutes kodi
var kodiMute = function(request, response) {
   console.log("Muting kodi request received");
   var m = new Boolean(true);
   kodi.Application.SetMute({mute:m});
};  

// Unmutes kodi
var kodiUnmute = function(request, response) {
   console.log("Unmuting kodi request received");
   var m  = new Boolean(false);
   kodi.Application.SetMute({mute:m});
};
// Gets the active kodi players
app.get("/activeplayers", function (request, response) {
  validateRequest(request, response, kodiGetActivePlayers)
});

// Sets the volume to a given integer value between 0 and 100
var kodiSetVolume = function(request, response) {
  console.log("Setting volume request received");
  var volume = request.query.q.trim();
  kodiSetVolumeInt(volume);
};  

var kodiIncreaseVolume = function(request, response) {
  console.log("Increase volume request received");
  var increment = request.query.q.trim();
  var arr = [ 'volume' ];
  var currentVolume = kodi.Application.GetProperties({properties:arr});
  currentVolume.then(function(results) {
    console.log(results);
    var volume = results["result"]["volume"];
    console.log("Current volume: " + volume);
    var newvolume = parseInt(Number(volume) + Number(increment));
    console.log("New volume : " + newvolume);
    if (newvolume > 100) {
     newvolume = 100;
    }
    kodiSetVolumeInt(newvolume);
   });
};  

var kodiDecreaseVolume = function(request, response) {
  console.log("Decrease volume request received");
  var decrement = request.query.q.trim();
  var arr = [ 'volume' ];
  var currentVolume = kodi.Application.GetProperties({properties:arr});
  currentVolume.then(function(results) {
    console.log(results);
    var volume = results["result"]["volume"];
    console.log("Current volume: " + volume);
    var newvolume = parseInt(Number(volume) - Number(decrement));
    console.log("New volume : " + newvolume);
    if (newvolume > 100) {
     newvolume = 100;
    }
    kodiSetVolumeInt(newvolume);
   });
};


var kodiSetVolumeInt = function (vol) {
  var vlm = parseInt (vol);
  kodi.Application.SetVolume({volume:vlm});
};

var kodiGetActivePlayers = function(request, response, cb) {
  console.log("Active players request received");
  var activePlayers = kodi.Player.GetActivePlayers();
  activePlayers.then(function(results) {
   console.log(results);
   var playerid = results["result"][0]["playerid"];
   console.log(playerid);
   if(cb && typeof cb == "function") {
   cb(playerid);
 }
  });
  
response.sendStatus(200);
};

var kodiPlayPause = function(request, response) {
  console.log("Play/Pause request received");
  kodiGetActivePlayers(request, response, function(results) { 
  var activePlayer = parseInt(results);
  console.log("Found active player = " + activePlayer);
  kodi.Player.PlayPause({playerid:activePlayer});
  });
};

// Stop video player
app.get("/stop", function (request, response) {
  validateRequest(request, response, kodiStop)
});

var kodiStop = function(request, response) {
  console.log("Stop request received");
  kodiGetActivePlayers(request, response, function(results) {
  var activePlayer = parseInt(results);
  console.log("Found active player = " + activePlayer);
  kodi.Player.Stop({playerid:activePlayer});
  });
};


// Parse request to watch a movie
// Request format:   http://[THIS_SERVER_IP_ADDRESS]/playmovie?q=[MOVIE_NAME]
app.get("/playmovie", function (request, response) {
  validateRequest(request, response, kodiPlayMovie)
});

app.get("/openyoutube", function(request, response) {
  console.log("Stopping all players");
  validateRequest(request, response, kodiStop);
  console.log("Searching youtube video based on criteria.");
  var criteria = request.query.q.trim();
  searchYoutubeMovie(criteria);
});

var playYoutube = function(videoId) {
  var url = 'plugin://plugin.video.youtube/?action=play_video&videoid=';
  var fullurl = url + videoId;
  console.log("Will attempt to open url = " + fullurl);
  kodi.Player.Open({item: { file: fullurl }});   
};	

var kodiPlayMovie = function(request, response) {
  var movieTitle = request.query.q.trim();
  console.log("Movie request received to play \"" + movieTitle + "\"");
    
  kodi.VideoLibrary.GetMovies()
  .then(function(movies) {
    if(!(movies && movies.result && movies.result.movies && movies.result.movies.length > 0)) {
      throw new Error('no results');
    }

    // Create the fuzzy search object
    var fuse = new Fuse(movies.result.movies, fuzzySearchOptions)
    var searchResult = fuse.search(movieTitle)

    // If there's a result
    if (searchResult.length > 0) {
      var movieFound = searchResult[0];
      console.log("Found movie \"" + movieFound.label + "\" (" + movieFound.movieid + ")");
      return kodi.Player.Open({item: { movieid: movieFound.movieid }});
    } else {
      throw new Error("Couldn\'t find movie \"" + movieTitle + "\"");
    }
  })
  .catch(function(e) {
    console.log(e);
  });
  response.sendStatus(200);
};


// Parse request to watch your next unwatched episode for a given tv show
// Request format:   http://[THIS_SERVER_IP_ADDRESS]/playtvshow?q=[TV_SHOW_NAME]
app.get("/playtvshow", function (request, response) {
  validateRequest(request, response, kodiPlayTvshow)
});

var kodiPlayTvshow = function(request, response) {
  var param = {
    tvshowTitle: request.query.q.trim().toLowerCase()
  };
  
  console.log("TV Show request received to play \"" + param["tvshowTitle"] + "\"");

  kodiFindTvshow (request, response, kodiPlayNextUnwatchedEpisode, param);
};


// Parse request to watch a specific episode for a given tv show
// Request format:   http://[THIS_SERVER_IP_ADDRESS]/playepisode?q[TV_SHOW_NAME]season[SEASON_NUMBER]episode&e[EPISODE_NUMBER]
// For example, if IP was 1.1.1.1 a request to watch season 2 episode 3 in tv show named 'bla' looks like:  
// http://1.1.1.1/playepisode?q=bla+season+2+episode&e=3
app.get("/playepisode", function (request, response) {
  validateRequest(request, response, kodiPlayEpisodeHandler)
});

var kodiPlayEpisodeHandler = function(request, response) {
  var requestPartOne = request.query.q.split("season");
  var param = {
    tvshowTitle: requestPartOne[0].trim().toLowerCase(),
    seasonNum: requestPartOne[1].trim().toLowerCase(),
    episodeNum: request.query.e
  };
  
  console.log("Specific Episode request received to play \"" + param["tvshowTitle"] + "\" Season " + param["seasonNum"] + " Episode " + param["episodeNum"]);
  
  kodiFindTvshow (request, response, kodiPlaySpecificEpisode, param);
};


var kodiFindTvshow = function(req, res, nextAction, param) {
  kodi.VideoLibrary.GetTVShows()
  .then(
    function(shows) {
      if(!(shows && shows.result && shows.result.tvshows && shows.result.tvshows.length > 0)) {
        throw new Error('no results');
      }
      // Create the fuzzy search object
      var fuse = new Fuse(shows.result.tvshows, fuzzySearchOptions)
      var searchResult = fuse.search(param["tvshowTitle"])

      // If there's a result
      if (searchResult.length > 0 && searchResult[0].tvshowid != null) {
        var tvshowFound = searchResult[0];
        console.log("Found tv show \"" + tvshowFound.label + "\" (" + tvshowFound.tvshowid + ")");
        param["tvshowid"] = tvshowFound.tvshowid;
        nextAction (req, res, param);
      } else {
        throw new Error("Couldn\'t find tv show \"" + param["tvshowTitle"] + "\"");
      }
    }
  )
  .catch(function(e) {
    console.log(e);
  })
};


var kodiPlayNextUnwatchedEpisode = function(req, res, RequestParams) {
  console.log("Searching for next episode of Show ID " + RequestParams["tvshowid"]  + "...");          

  // Build filter to search unwatched episodes
  var param = {
          tvshowid: RequestParams["tvshowid"],
          properties: ['playcount', 'showtitle', 'season', 'episode'],
          // Sort the result so we can grab the first unwatched episode
          sort: {
            order: 'ascending',
            method: 'episode',
            ignorearticle: true
          }
        }
  kodi.VideoLibrary.GetEpisodes(param)
  .then(function (episodeResult) {
    if(!(episodeResult && episodeResult.result && episodeResult.result.episodes && episodeResult.result.episodes.length > 0)) {
      throw new Error('no results');
    }
    var episodes = episodeResult.result.episodes;
    // Check if there are episodes for this TV show
    if (episodes) {
      console.log("found episodes..");
      // Check whether we have seen this episode already
      var firstUnplayedEpisode = episodes.filter(function (item) {
        return item.playcount === 0
      })
      if (firstUnplayedEpisode.length > 0) {
        var episdoeToPlay = firstUnplayedEpisode[0]; // Resolve the first unplayed episode
        console.log("Playing season " + episdoeToPlay.season + " episode " + episdoeToPlay.episode + " (ID: " + episdoeToPlay.episodeid + ")");
        var param = {
            item: {
              episodeid: episdoeToPlay.episodeid
            }
          }
        return kodi.Player.Open(param);
      }
    }
  })
  .catch(function(e) {
    console.log(e);
  });
  res.sendStatus(200);
};


var kodiPlaySpecificEpisode = function(req, res, RequestParams) {
  console.log("Searching Season " + RequestParams["seasonNum"] + ", episode " + RequestParams["episodeNum"] + " of Show ID " + RequestParams["tvshowid"] + "...");          

  // Build filter to search for specific season number
  var param = {
          tvshowid: RequestParams["tvshowid"],
          //episode: requestedEpisodeNum,
          season: parseInt(RequestParams["seasonNum"]),
          properties: ['playcount', 'showtitle', 'season', 'episode']
        }
  kodi.VideoLibrary.GetEpisodes(param)
  .then(function (episodeResult) {
    if(!(episodeResult && episodeResult.result && episodeResult.result.episodes && episodeResult.result.episodes.length > 0)) {
      throw new Error('no results');
    }
    var episodes = episodeResult.result.episodes;
    // Check if there are episodes for this TV show
    if (episodes) {
      console.log("found episodes..");
      // Check for the episode number requested
      var matchedEpisodes = episodes.filter(function (item) {
        return item.episode === parseInt(RequestParams["episodeNum"])
      })
      if (matchedEpisodes.length > 0) {
        var episdoeToPlay = matchedEpisodes[0];
        console.log("Playing season " + episdoeToPlay.season + " episode " + episdoeToPlay.episode + " (ID: " + episdoeToPlay.episodeid + ")");
        var param = {
            item: {
              episodeid: episdoeToPlay.episodeid
            }
          }
        return kodi.Player.Open(param);
      }
    }
  })
  .catch(function(e) {
    console.log(e);
  });
  res.sendStatus(200);
};


app.get("/", function (request, response) {
  //response.sendStatus(200);
  response.sendFile(__dirname + '/views/index.html');
});

// listen for requests :)
var listener = app.listen(process.env.PORT, function () {
  console.log('Your app is listening on port ' + listener.address().port);
});