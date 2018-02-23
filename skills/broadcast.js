var RateLimiter = require('limiter').RateLimiter;
var limiter = null;
var api = null;

var getTime = function() {
    return (new Date()).getTime();
}

var isEmpty = function(object) {
    if ((object == null)
        || (object == 'undefined')) return true;
    if ((typeof(object) == "string") &&  (object.trim() == '')) return true;
    if ((object instanceof Array) &&  (Object.keys(object).length  <= 0)) return true; 
    return false;
};

var validateEmail = function(email) {   
    var re = /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
    var response = re.test(email.trim());
    return re.test(email.trim());
}


var waitTill = 0;

var startTime = getTime();
var job = {};       //List of jobs to be executed


/*
Helper function: Removes unwanted elements from Array.
Example: array.clean(undefined)
/*/
Array.prototype.clean = function(deleteValue) {
  for (var i = 0; i < this.length; i++) {
    if (this[i] == deleteValue) {         
      this.splice(i, 1);
      i--;
    }
  }
  return this;
};

//Checks if the job is complete
var jobComplete = function(spaceId, action) {
    //console.log(job[spaceId].items.length + " / " + job[spaceId].pArr.length + " / " + job[spaceId].numItems)
    if ((job[spaceId].items.length === 0) && Promise.all(job[spaceId].pArr) && job[spaceId].pArr.length >= job[spaceId].numItems) {   //No more jobs left and we have all Promises
        if (job[spaceId].timeout) {
            clearInterval(job[spaceId].timeout);
        }
        console.log(spaceId + ": Completed: " + action + " **" + job[spaceId].success + "** members with **" + job[spaceId].errors + "** errors");
        job[spaceId].callback(spaceId);
    }
}

//Add 1 member to the space
var inviteMember = function(spaceId, person) {
    console.log(spaceId + ": Adding user: " + person);
    api.memberships.create({
        roomId: spaceId,
        personEmail: person
    }).then(function(response){
        console.log(spaceId + ": Added user: " + person);
        job[spaceId].success++;
        job[spaceId].pArr.push("")
        jobComplete(spaceId, "Added")
    }).catch(function(err){
        job[spaceId].errors++;
        if (err.statusCode === 429) {
            console.log(spaceId + ': ' + person + ' could not be added. Rate limit error: \n' + JSON.stringify(err.headers));
            var retryAfter = 28000;
            if (err.headers["retry-after"] != undefined) {
                retryAfter = parseInt(err.headers["retry-after"]) * 1000;
            } else {
                console.log(spaceId + ": inviteMember: ERROR: retry-after is MISING.\n" + JSON.stringify(err.headers));
            }
            waitTill = getTime() + retryAfter + 2000;
            job[spaceId].items.push(person);
            job[spaceId].numItems++;
            job[spaceId].pArr.push("");
        } else {
            console.log(spaceId + ': inviteMember: ERROR: Adding ' + person + ' had a ' + err.statusCode + ' error: \n' + JSON.stringify(err));
            if (err.statusCode === 409) {
                job[spaceId].errors--;
                job[spaceId].pArr.push("");
            } else
                job[spaceId].pArr.push(person); 
        }
        jobComplete(spaceId, "Added");
    })
    //job[spaceId].pArr.push("")
    jobComplete(spaceId, "Added");
}

var blockBroadcast = function(spaceId) {
    if ((job[spaceId].items.length > 0) && (waitTill <= getTime())) {       //Have Pending jobs and Spark has not told us to wait.
        limiter.removeTokens(1, function(err, remainingRequests) {          //Trying not to go over the Spark Rate Limit by limiting to few messages per second
            if (remainingRequests >= 1)
                    inviteMember(spaceId, job[spaceId].items.shift())
        });
    }
}



module.exports = function(controller) {
    api = controller.api;
    console.log("broadcast skill");
    var mps = (process.env.bot_messagesPerSecond != undefined)?process.env.bot_messagesPerSecond:5;
    console.log("Rate Limit set to " + mps + " messages per second.");
    limiter = new RateLimiter(mps, 'second', true)

    //INVITE
    controller.on('direct_mention,direct_message',function(bot,message) {
        console.log(message.channel + ": \/invite initiated by: " + message.user);
        var userList = [];
        var retrieveFile = function() {
            console.log(message.channel + ": retrieveFile");
            return new Promise(function(fulfill, reject) {
                if (!isEmpty(message.data.files)) {
                    console.log(message.channel + ": retrieveFile: File is not empty");
                    bot.retrieveFile(message.data.files[0], function(err, body) {
                        if (!err) {
                            console.log(message.channel + ": retrieveFile: Retrieved File: " + body);
                            fulfill(body.split(/[\n\s;:<>]+/));
                        } else {
                            console.log(message.channel + ": ERROR: " + err);
                            fulfill([]);
                        }
                    });
                } else fulfill([]);
            });
        }

        /*
        Helper Function: Takes an admin command and extracts sub-commands and data.
        Example: cleanCommand(message) where message constains "/init/#tag Some Text"
        Result will have commands=[#tag] data="Some Text"
        /*/
        var cleanCommand = function() {
            console.log(message.channel + ": cleanCommand - Message before cleaning: " + message.html);
            var response = "";
            var botName = bot.botkit.identity.displayName;
            if (message.html.indexOf(botName) == -1) 
                botName = botName.split(" ")[0];
            if (message.html.indexOf(botName) == -1)
                response = message.html;
            else
                response = message.html.substring(message.text.indexOf(botName) + botName.length);
            console.log(message.channel + ": cleanCommand - Message after cleaning: " + response);
            return response;
        }

        var buildUserList = function() {
            console.log(message.channel + ": buildUserList");
            var cleanedText = cleanCommand();
            console.log(message.channel + ": buildUserList: cleaned Text: " + cleanedText);
            return new Promise(function(fulfill, reject) {
                if (isEmpty(message.data.files) && isEmpty(cleanedText)) {
                    fulfill(userList);
                    return;
                } else {
                    retrieveFile().then(function(fileUserList) {
                        if (!isEmpty(cleanedText)) userList = cleanedText.trim().split(/[\n\s;:<>]+/);
                        if (!isEmpty(fileUserList)) userList = userList.concat(fileUserList);
                        userList = userList.filter(function(entry) {
                            return entry.trim() != '';
                        });
                        console.log(message.channel + ": User List before Cleanup: \n" + userList);
                        userList = userList.map(function(x){if(validateEmail(x)) return x.toLowerCase().trim()});
                        userList.clean(undefined)
                        console.log(message.channel + ": User List after Cleanup: \n" + userList);
                        fulfill(userList);
                    });
                }
            });
        }

        var checkRoomStatus = function() {
            console.log(message.channel + ": checkRoomStatus");
            return new Promise(function(fulfill, reject) {
                api.rooms.get(message.channel).then(function(roomInfo){
                    if (roomInfo.type == "direct") {
                        console.log(message.channel + ": checkRoomStatus - Room (" + roomInfo.title + ") - DIRECT Space.");
                        bot.reply(message, "Howdy! Happy to round up pardners in a group space. Whole lot of nothing is what I can do here.");
                        fulfill(false);
                    } else {
                        if (roomInfo && roomInfo.isLocked) {
                            api.memberships.list({roomId: message.channel, personEmail: message.user}).then(function(memInfo_user){
                                if (memInfo_user && memInfo_user.items[0].isModerator) {                         
                                    api.people.get('me').then(function(identity) {
                                        api.memberships.list({roomId: message.channel, personEmail: identity.emails[0]}).then(function(memInfo){
                                            if (memInfo && memInfo.items[0].isModerator) fulfill(true);
                                            else {
                                                bot.reply(message, "Yikes! Both you and I need to be moderators to make this happen. The jig is up.");
                                                fulfill(false);
                                            }
                                        })
                                     })
                                 } else {
                                    bot.reply(message, "Yikes! Both you and I need to be moderators to make this happen. The jig is up.");
                                    fulfill(false);
                                 }
                             });
                        } else {
                            console.log(message.channel + ": checkRoomStatus - Room (" + roomInfo.title + ") is OK for onboarding.");
                            fulfill(true);
                        }
                    }
                }).catch(function(err){
                    lconsole.log(message.channel + ": ERROR: checkRoomStatus - Get Room By Id Error: " + err);
                    bot.reply(message, "Yikes! An error. I've got to skedaddle.");
                    reject(err);
                });
            });
        }

        var taskComplete = function(spaceId) {
            if (job[spaceId].success > 0) {
                console.log(spaceId + ": Everyone's here. Time for a hoedown.");
                bot.reply(message, "Everyone's here. Time for a hoedown.");
            } else {
                console.log(spaceId + ": ERROR: I'm a goner. I couldn't add anyone.");
                bot.reply(message, "I'm a goner. I couldn't add anyone.");
            }
            if (job[spaceId].errors > 0) {
                api.rooms.get(spaceId).then(function(roomInfo){
                    var errList = job[spaceId].pArr.clean("");
                    var errText = "In **" + roomInfo.title + "**, these yokels couldn't be invited: " + errList;
                    if (errText) {
                        console.log(spaceId + ": ERROR: " + message.user + ": " + errText);
                        api.messages.create({toPersonEmail: message.user, markdown: errText}).then(function(response){
                            console.log(response);
                        }).catch(function(err){
                            console.log(err);
                        });
                    }
                    if (job.hasOwnProperty(spaceId))
                            delete job[spaceId];
                })
            } else {
                if (job.hasOwnProperty(spaceId))
                    delete job[spaceId];
            }
            //console.log(spaceId + ": Pending Jobs: " + JSON.stringify(job));
            console.log(spaceId + ": Task Complete");
        }

        checkRoomStatus().then(function(proceed){
            console.log(message.channel + ": checkRoomStatus: " + proceed);
            if (proceed) {
                console.log(message.channel + ": checkRoomStatus is OK. Prepare to buildUserList");
                buildUserList().then(function(userList) {
                    if (!isEmpty(userList)) {
                        job[message.channel] = {
                            'items': userList.slice(),
                            'numItems': userList.length,
                            'callback': taskComplete,
                            'success': 0,
                            'errors': 0,
                            'pArr': [],
                            'timeout': undefined
                        }
                        console.log(message.channel + ": Preparing to add **" + job[message.channel].items.length + "** members to this space");
                        if (userList.length >= 10)
                            bot.reply(message, "Yee-haaw! Rounding up those greenhorns now.");
                        job[message.channel].timeout = setInterval(blockBroadcast, (1000 / process.env.bot_messagesPerSecond), message.channel);
                    } else {
                        console.log(message.channel + ": /help");
                        var text = "I'm here to rope people into this space. Mention me with one of the options below:";
                        text += "\n\n>`email@domain.com next.email@another.domain` Adds specified users into this space.";
                        text += "\n\n>`<text file attachment>` Adds all users from the attached text file.";
                        text += "\n\n`Note:` If the space is locked, I need to be assigned moderator privileges.";
                        console.log(message.channel + ": /help: " + text);
                        bot.reply(message, text);
                    }
                });
            } else {
                console.log(message.channel + ": checkRoomStatus: " + proceed);
            }
        }).catch(function(err) {
            console.log(message.channel + ": checkRoomStatus: %s" + err);
        });
    });
};
