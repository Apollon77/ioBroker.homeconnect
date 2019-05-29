"use strict";

const utils = require(__dirname + "/lib/utils"); // Get common adapter utils
const auth = require(__dirname + "/lib/auth.js");
const EventEmitter = require("events");
const EventSource = require("eventsource");

const adapter = new utils.Adapter("homeconnect");

let getTokenInterval;
let getTokenRefreshInterval;

function stateGet(stat) {
    return new Promise((resolve, reject) => {
        adapter.getState(stat, function (err, state) {
            if (err) {
                reject(err);
            } else {
                if (typeof state != undefined && state != null) {
                    let value = state.val;
                    resolve(value);
                } else {
                    let value = false;
                    resolve(value);
                }
            }
        });
    });
}

function getRefreshToken() {
    let stat = adapter.namespace + ".dev.refreshToken";
    stateGet(stat).then(value => {
        auth.tokenRefresh(value).then(
            ([token, refreshToken, expires, tokenScope]) => {
                adapter.log.info("Accestoken renewed...");
                adapter.setState("dev.token", {
                    val: token,
                    ack: true
                });
                adapter.setState("dev.refreshToken", {
                    val: refreshToken,
                    ack: true
                });
                adapter.setState("dev.expires", {
                    val: expires,
                    ack: true
                });
                adapter.setState("dev.tokenScope", {
                    val: tokenScope,
                    ack: true
                });
            },
            statusPost => {
                if (statusPost == "400") {
                    adapter.log.error("FEHLER beim Refresh-Token!");
                } else {
                    adapter.log.error("Irgendwas stimmt da wohl nicht!! Refresh-Token!!    Fehlercode: " + statusPost);
                }
            }
        );
    });
}

function getToken() {
    let stat = "dev.devCode";

    stateGet(stat).then(
        value => {
            let clientID = adapter.config.clientID;
            let deviceCode = value;
            auth.tokenGet(deviceCode, clientID).then(
                ([token, refreshToken, expires, tokenScope]) => {
                    adapter.log.info("Accestoken created: " + token);
                    adapter.setState("dev.token", {
                        val: token,
                        ack: true
                    });
                    adapter.setState("dev.refreshToken", {
                        val: refreshToken,
                        ack: true
                    });
                    adapter.setState("dev.expires", {
                        val: expires,
                        ack: true
                    });
                    adapter.setState("dev.tokenScope", {
                        val: tokenScope,
                        ack: true
                    });
                    clearInterval(getTokenInterval);
                    adapter.log.info("Start Refreshinterval");
                    getTokenRefreshInterval = setInterval(getRefreshToken, 21600000);
                },
                statusPost => {
                    if (statusPost == "400") {
                        let stat = "dev.authUriComplete";

                        stateGet(stat).then(
                            value => {
                                adapter.log.error("Bitte ioBroker authorisieren!!  =====>>>   " + value);
                            },
                            err => {
                                adapter.log.error("FEHLER: " + err);
                            }
                        );
                    } else {
                        adapter.log.error("Irgendwas stimmt da wohl nicht!! GetToken!!    Fehlercode: " + statusPost);
                        clearInterval(getTokenInterval);
                    }
                }
            );
        },
        err => {
            adapter.log.error("getToken FEHLER: " + err);
            clearInterval(getTokenInterval);
        }
    );
}

/* Eventstream
 */
function startEventStream(token, haId) {

    let baseUrl = "https://api.home-connect.com/api/homeappliances/" + haId + "/events";
    let header = {
        headers: {
            Authorization: "Bearer " + token,
            Accept: "text/event-stream"
        }
    };
    let eventSource = new EventSource(baseUrl, header);
    // Error handling
    eventSource.onerror = err => {
        adapter.log.error(err.status);
        if (err.status !== undefined) {
            adapter.log.error("Error (" + haId + ")", err);
            if (err.status === 401) {
                getRefreshToken();
                // Most likely the token has expired, try to refresh the token
                adapter.log.info("Token abgelaufen");
            } else if (err.status === 429) {
                adapter.log.warn("Too many requests. Adapter sends too many requests per minute.");
            } else {
                adapter.log.error("FEHLER");
                throw new Error(err.status);
            }
        }
    };
    eventSource.addEventListener("STATUS", e => processEvent(e), false);
    eventSource.addEventListener("NOTIFY", e => processEvent(e), false);
    eventSource.addEventListener("EVENT", e => processEvent(e), false);
    eventSource.addEventListener("CONNECTED", e => processEvent(e), false);
    eventSource.addEventListener("DISCONNECTED", e => processEvent(e), false);
    //this.eventSource.addEventListener('KEEP-ALIVE', () => lastAlive = new Date(), false)


}

//Eventstream ==>> Datenpunkt

let processEvent = msg => {
    /*Auswertung des Eventstreams*/
    try {

        adapter.log.debug("event: " + JSON.stringify(msg))
        let stream = msg
        let parseMsg = msg.data;
        let parseMessage = JSON.parse(parseMsg);

        if (stream.type == "DISCONNECTED") {
            adapter.log.debug("DISCONNECTED");
        }

        parseMessage.items.forEach(element => {
            let haId = parseMessage.haId
            let folder = element.uri.split("/").splice(4)
            if (folder[folder.length - 1].indexOf(".") != -1) {
                folder.pop();
            }
            folder = folder.join(".");
            const key = element.key.replace(/\./g, '_')

            //
            adapter.log.debug(haId + "." + folder + "." + key + ":" + element.value);
            adapter.setObjectNotExists(haId + "." + folder + "." + key, {
                type: "state",
                common: {
                    name: key,
                    type: "object",
                    role: "indicator",
                    write: true,
                    read: true
                },
                native: {}
            });
            adapter.setState(haId + "." + folder + "." + key, element.value, true);

        });

    } catch (error) {
        adapter.log.error(error)
    }

};

adapter.on("unload", function (callback) {
    try {
        adapter.log.info("cleaned everything up...");
        clearInterval(getTokenRefreshInterval);
        clearInterval(getTokenInterval);
        callback();
    } catch (e) {
        callback();
    }
});

adapter.on("objectChange", function (id, obj) {
    adapter.log.info("objectChange " + id + " " + JSON.stringify(obj));
});

adapter.on("stateChange", function (id, state) {
    if (id == adapter.namespace + ".dev.homeappliancesJSON") {
        let appliances = state.val;
        let appliancesArray = JSON.parse(appliances);
        appliancesArray.data.homeappliances.forEach(element => {
            let haId = element.haId;
            for (const key in element) {
                adapter.setObjectNotExists(haId + ".general." + key, {
                    type: "state",
                    common: {
                        name: key,
                        type: "object",
                        role: "indicator",
                        write: false,
                        read: true
                    },
                    native: {}
                });
                adapter.setState(haId + ".general." + key, element[key]);
            }


            let tokenID = adapter.namespace + ".dev.token";
            stateGet(tokenID).then(
                value => {
                    let token = value;
                    getAPIValues(token, haId, "/status");
                    getAPIValues(token, haId, '/programs/available');
                    getAPIValues(token, haId, '/settings');
                    getAPIValues(token, haId, "/programs/active");
                    getAPIValues(token, haId, "/programs/active/options");
                    getAPIValues(token, haId, "/programs/selected");
                    getAPIValues(token, haId, "/programs/selected/options");
                    startEventStream(token, haId);
                },
                err => {
                    adapter.log.error("FEHLER: " + err);
                }
            );
        });
    }

    if (id == adapter.namespace + ".dev.token") {
        let token = state.val;
        adapter.setState("dev.access", true);
        auth.getAppliances(token).then(
            appliances => {
                adapter.setState(adapter.namespace + ".dev.homeappliancesJSON", JSON.stringify(appliances));
            },
            ([statusGet, description]) => {
                adapter.log.error("Error getting Aplliances Error: " + statusGet);
                adapter.log.error(description);
            }
        );
    }

    if (id == adapter.namespace + ".dev.devCode") {
        getTokenInterval = setInterval(getToken, 10000); // Polling bis Authorisation erfolgt ist
    }

    // you can use the ack flag to detect if it is status (true) or command (false)
    if (state && !state.ack) {
        //adapter.log.info('ack is not set!');
    }
});

// Some message was sent to adapter instance over message box. Used by email, pushover, text2speech, ...
adapter.on("message", function (obj) {
    if (typeof obj === "object" && obj.message) {
        if (obj.command === "send") {
            // e.g. send email or pushover or whatever
            console.log("send command");

            // Send response in callback if required
            if (obj.callback) adapter.sendTo(obj.from, obj.command, "Message received", obj.callback);
        }
    }
});

adapter.on("ready", function () {
    main();
});

function getAPIValues(token, haId, url) {
    auth.getRequest(token, haId, url).then(returnValue => {
        adapter.log.debug(url);
        adapter.log.debug(JSON.stringify(returnValue))
        if ("key" in returnValue.data) {
            returnValue.data = {
                items: [returnValue.data]
            };
        }
        for (const item in returnValue.data) {
            returnValue.data[item].forEach(subElement => {
                if (url === '/programs/active') {
                    subElement.key = 'BSH_Common_Root_ActiveProgram'
                    subElement.name = 'BSH_Common_Root_ActiveProgram'
                }
                const folder = url.replace(/\//g, ".");
                adapter.log.debug(haId + folder + "." + subElement.key.replace(/\./g, '_'))

                adapter.setObjectNotExists(haId + folder + "." + subElement.key.replace(/\./g, '_'), {
                    type: "state",
                    common: {
                        name: subElement.name,
                        type: "object",
                        role: "indicator",
                        write: false,
                        read: true
                    },
                    native: {}
                });
                adapter.setState(haId + folder + "." + subElement.key.replace(/\./g, '_'), subElement.value, true);
            });
        }
    }, ([statusGet, description]) => {
        // adapter.log.info("Error getting API Values Error: " + statusGet);
        adapter.log.info(haId + ": " + description);
    });
}

function main() {
    if (!adapter.config.clientID) {
        adapter.log.error("Client ID not specified!");
    }

    /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

    if (adapter.config.resetAccess) {
        adapter.log.info("Reset access");
        adapter.setState("dev.authUriComplete", "");
        adapter.setState("dev.devCode", "");
        adapter.setState("dev.access", false);
        adapter.setState("dev.token", "");
        adapter.setState("dev.refreshToken", "");
        adapter.setState("dev.expires", "");
        adapter.setState("dev.tokenScope", "");
        let adapterConfig = "system.adapter." + adapter.name + "." + adapter.instance;
        adapter.getForeignObject(adapterConfig, (error, obj) => {
            obj.native.authUri = "";
            obj.native.clientID = "";
            obj.native.resetAccess = false;
            adapter.setForeignObject(adapterConfig, obj);
        });
        return;
    }
    //OAuth2 Deviceflow
    //Get Authorization-URI to grant access ===> User interaction

    let scope = adapter.config.scope;
    let clientID = adapter.config.clientID;

    let stat = adapter.namespace + ".dev.devCode";
    stateGet(stat).then(value => {
        if (value == false) {
            auth.authUriGet(scope, clientID).then(
                ([authUri, devCode, pollInterval]) => {
                    adapter.setState("dev.authUriComplete", authUri);
                    adapter.setState("dev.devCode", devCode);
                    adapter.setState("dev.pollInterval", pollInterval);
                    let adapterConfig = "system.adapter." + adapter.name + "." + adapter.instance;
                    adapter.getForeignObject(adapterConfig, (error, obj) => {
                        if (!obj.native.authUri) {
                            obj.native.authUri = authUri;
                            adapter.setForeignObject(adapterConfig, obj);
                        }
                    });
                },
                statusPost => {
                    if (statusPost == "400") {
                        adapter.log.error("400 Bad Request (invalid or missing request parameters)");
                    } else {
                        adapter.log.error("Irgendwas stimmt da wohl nicht!!    Fehlercode: " + statusPost);
                    }
                }
            );
        } else {
            let stat = adapter.namespace + ".dev.token";
            stateGet(stat).then(
                value => {
                    if (!value) {
                        getTokenInterval = setInterval(getToken, 10000);
                    } else {
                        let token = value;
                        auth.getAppliances(token).then(
                            appliances => {
                                adapter.setState(adapter.namespace + ".dev.homeappliancesJSON", JSON.stringify(appliances));
                            },
                            statusGet => {
                                adapter.log.error(
                                    "Error getting homeapplianceJSON with Token please reset Token. Fehlercode: " + statusGet
                                );
                            }
                        );
                        let stat = adapter.namespace + ".dev.refreshToken";
                        stateGet(stat).then(value => {
                            let refreshToken = value;
                            getTokenRefreshInterval = setInterval(getRefreshToken, 21600000);
                        });
                    }
                },
                err => {
                    adapter.log.error("FEHLER: " + err);
                }
            );
        }
    });

    adapter.setObjectNotExists("dev.authUriComplete", {
        type: "state",
        common: {
            name: "AuthorizationURI",
            type: "mixed",
            role: "indicator",
            write: false,
            read: true
        },
        native: {}
    });

    adapter.setObjectNotExists("dev.devCode", {
        type: "state",
        common: {
            name: "DeviceCode",
            type: "mixed",
            role: "indicator",
            write: false,
            read: true
        },
        native: {}
    });

    adapter.setObjectNotExists("dev.pollInterval", {
        type: "state",
        common: {
            name: "Poll-Interval in sec.",
            type: "mixed",
            role: "indicator",
            write: false,
            read: true
        },
        native: {}
    });

    adapter.setObjectNotExists("dev.token", {
        type: "state",
        common: {
            name: "Access-Token",
            type: "mixed",
            role: "indicator",
            write: false,
            read: true
        },
        native: {}
    });

    adapter.setObjectNotExists("dev.refreshToken", {
        type: "state",
        common: {
            name: "Refresh-Token",
            type: "mixed",
            role: "indicator",
            write: false,
            read: true
        },
        native: {}
    });

    adapter.setObjectNotExists("dev.access", {
        type: "state",
        common: {
            name: "access",
            type: "boolean",
            role: "indicator",
            write: true,
            read: true
        },
        native: {}
    });

    adapter.setObjectNotExists("dev.homeappliancesJSON", {
        type: "state",
        common: {
            name: "Homeappliances_JSON",
            type: "object",
            role: "indicator",
            write: false,
            read: true
        },
        native: {}
    });

    adapter.setObjectNotExists("dev.expires", {
        type: "state",
        common: {
            name: "Token expires in sec",
            type: "number",
            role: "indicator",
            write: false,
            read: true
        },
        native: {}
    });

    adapter.setObjectNotExists("dev.tokenScope", {
        type: "state",
        common: {
            name: "Scope",
            type: "mixed",
            role: "indicator",
            write: false,
            read: true
        },
        native: {}
    });

    adapter.setObjectNotExists("dev.eventStreamJSON", {
        type: "state",
        common: {
            name: "Eventstream_JSON",
            type: "object",
            role: "indicator",
            write: false,
            read: true
        },
        native: {}
    });

    //settingsAvailableJSON

    adapter.subscribeStates("*");
}