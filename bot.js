/*~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
           ______     ______     ______   __  __     __     ______
          /\  == \   /\  __ \   /\__  _\ /\ \/ /    /\ \   /\__  _\
          \ \  __<   \ \ \/\ \  \/_/\ \/ \ \  _"-.  \ \ \  \/_/\ \/
           \ \_____\  \ \_____\    \ \_\  \ \_\ \_\  \ \_\    \ \_\
            \/_____/   \/_____/     \/_/   \/_/\/_/   \/_/     \/_/


This is a sample Cisco Spark bot built with Botkit.

# RUN THE BOT:
  Follow the instructions here to set up your Cisco Spark bot:
    -> https://developer.ciscospark.com/bots.html
  Run your bot from the command line:
    access_token=<MY BOT ACCESS TOKEN> public_address=<MY PUBLIC HTTPS URL> node bot.js



~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~*/
var env = require('node-env-file');
env(__dirname + '/.env');

var logPath = (process.env.bot_logPath != undefined)?process.env.bot_logPath:"./";
var fs = require('fs');
 
if (!process.env.access_token) {
    console.log('Error: Specify a Cisco Spark access_token in environment.');
    usage_tip();
    process.exit(1);
}

if (!process.env.public_address) {
    console.log('Error: Specify an SSL-enabled URL as this bot\'s public_address in environment.');
    usage_tip();
    process.exit(1);
}

var Botkit = require('botkit');
var debug = require('debug')('botkit:main');

// Create the Botkit controller, which controls all instances of the bot.
var controller = Botkit.sparkbot({
    // debug: true,
    // limit_to_domain: ['mycompany.com'],
    // limit_to_org: 'my_cisco_org_id',
    public_address: process.env.public_address,
    ciscospark_access_token: process.env.access_token,
    secret: process.env.secret, // this is an RECOMMENDED but optional setting that enables validation of incoming webhooks
    webhook_name: 'Cisco Spark bot created with Botkit, override me before going to production',
});

// Set up an Express-powered webserver to expose oauth and webhook endpoints
var webserver = require(__dirname + '/components/express_webserver.js')(controller);

// Tell Cisco Spark to start sending events to this application
require(__dirname + '/components/subscribe_events.js')(controller);

// Load in some helpers that make running Botkit on Glitch.com better
//require(__dirname + '/components/plugin_glitch.js')(controller);

// Enable Dashbot.io plugin
//require(__dirname + '/components/plugin_dashbot.js')(controller);

var normalizedPath = require("path").join(__dirname, "skills");
fs.readdirSync(normalizedPath).forEach(function(file) {
  console.log(file)
  if (!file.startsWith("."))
    require("./skills/" + file)(controller);
});


function usage_tip() {
    console.log('~~~~~~~~~~');
    console.log('Botkit Studio Starter Kit');
    console.log('Execute your bot application like this:');
    console.log('access_token=<MY ACCESS TOKEN> public_address=<https://mybotapp/> node bot.js');
    console.log('Get Cisco Spark token here: https://developer.ciscospark.com/apps.html')
    console.log('Get a Botkit Studio token here: https://studio.botkit.ai/')
    console.log('~~~~~~~~~~');
}
