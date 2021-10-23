"use strict";

const utils = require("@iobroker/adapter-core");
const auth = require(__dirname + "/lib/auth.js");
const EventEmitter = require("events");
const EventSource = require("eventsource");
const request = require("request");

let adapter;

function startAdapter(options) {
    options = options || {};
    Object.assign(options, {
        name: "homeconnect",
    });
    adapter = new utils.Adapter(options);

    let getTokenInterval;
    let getTokenRefreshInterval;
    let reconnectEventStreamInterval;
    let retryTimeout;
    let rateLimitTimeout;
    let restartTimeout;
    let eventSource;
    const availablePrograms = {};
    const availableProgramOptions = {};
    const eventSourceList = {};
    const reconnectTimeouts = {};
    const currentSelected = {};

    let rateCalculation = [];

    function stateGet(stat) {
        return new Promise((resolve, reject) => {
            adapter.getState(stat, function (err, state) {
                if (err) {
                    reject(err);
                } else {
                    if (typeof state != undefined && state != null) {
                        const value = state.val;
                        resolve(value);
                    } else {
                        const value = false;
                        resolve(value);
                    }
                }
            });
        });
    }

    function getRefreshToken(disableReconnectStream) {
        const stat = adapter.namespace + ".dev.refreshToken";
        stateGet(stat)
            .then((value) => {
                auth.tokenRefresh(value)
                    .then(
                        ([token, refreshToken, expires, tokenScope]) => {
                            adapter.log.info("Accesstoken renewed...");
                            adapter.setState("dev.token", {
                                val: token,
                                ack: true,
                            });
                            adapter.setState("dev.refreshToken", {
                                val: refreshToken,
                                ack: true,
                            });
                            adapter.setState("dev.expires", {
                                val: expires,
                                ack: true,
                            });
                            adapter.setState("dev.tokenScope", {
                                val: tokenScope,
                                ack: true,
                            });
                            if (!disableReconnectStream) {
                                Object.keys(eventSourceList).forEach(function (key) {
                                    startEventStream(token, key);
                                });
                            }
                        },
                        ([statusCode, description]) => {
                            retryTimeout = setTimeout(() => {
                                getRefreshToken();
                            }, 5 * 60 * 1000); //5min
                            adapter.log.error("Error Refresh-Token: " + statusCode + " " + description);
                            adapter.log.warn("Retry Refresh Token in 5min");
                        }
                    )
                    .catch(() => {
                        adapter.log.debug("No able to get refesh token ");
                    });
            })
            .catch(() => {
                adapter.log.debug("No refreshtoken found");
            });
    }

    function getToken() {
        stateGet("dev.devCode")
            .then(
                (deviceCode) => {
                    const clientID = adapter.config.clientID;
                    auth.tokenGet(deviceCode, clientID)
                        .then(
                            ([token, refreshToken, expires, tokenScope]) => {
                                adapter.log.debug("Accesstoken created: " + token);
                                adapter.setState("dev.token", {
                                    val: token,
                                    ack: true,
                                });
                                adapter.setState("dev.refreshToken", {
                                    val: refreshToken,
                                    ack: true,
                                });
                                adapter.setState("dev.expires", {
                                    val: expires,
                                    ack: true,
                                });
                                adapter.setState("dev.tokenScope", {
                                    val: tokenScope,
                                    ack: true,
                                });
                                clearInterval(getTokenInterval);

                                adapter.setState("dev.access", true, true);
                                auth.getAppliances(token)
                                    .then(
                                        (appliances) => {
                                            parseHomeappliances(appliances);
                                        },
                                        ([statusCode, description]) => {
                                            adapter.log.error("Error getting Aplliances Error: " + statusCode);
                                            adapter.log.error(description);
                                        }
                                    )
                                    .catch(() => {
                                        adapter.log.debug("No appliance found");
                                    });

                                adapter.log.debug("Start Refreshinterval");
                                getTokenRefreshInterval = setInterval(getRefreshToken, 20 * 60 * 60 * 1000); //every 20h
                            },
                            (statusPost) => {
                                if (statusPost == "400") {
                                    const stat = "dev.authUriComplete";

                                    stateGet(stat)
                                        .then(
                                            (value) => {
                                                adapter.log.error("Please visit this url:  " + value);
                                                adapter.log.info("If u dont see a login form reset 'Zugang/Token' in the instance settings");
                                            },
                                            (err) => {
                                                adapter.log.error("FEHLER: " + err);
                                            }
                                        )
                                        .catch(() => {
                                            adapter.log.debug("No state" + stat + " found");
                                        });
                                } else {
                                    adapter.log.error("Error GetToken: " + statusPost);
                                    clearInterval(getTokenInterval);
                                }
                            }
                        )
                        .catch(() => {
                            adapter.log.debug("No token found");
                        });
                },
                (err) => {
                    adapter.log.error("getToken FEHLER: " + err);
                    clearInterval(getTokenInterval);
                }
            )
            .catch(() => {
                adapter.log.debug("No token found");
            });
    }

    /* Eventstream
     */
    function startEventStream(token, haId) {
        adapter.log.debug("Start EventStream " + haId);
        const baseUrl = "https://api.home-connect.com/api/homeappliances/" + haId + "/events";
        const header = {
            headers: {
                Authorization: "Bearer " + token,
                Accept: "text/event-stream",
            },
        };
        if (eventSourceList[haId]) {
            eventSourceList[haId].close();
            eventSourceList[haId].removeEventListener("STATUS", (e) => processEvent(e), false);
            eventSourceList[haId].removeEventListener("NOTIFY", (e) => processEvent(e), false);
            eventSourceList[haId].removeEventListener("EVENT", (e) => processEvent(e), false);
            eventSourceList[haId].removeEventListener("CONNECTED", (e) => processEvent(e), false);
            eventSourceList[haId].removeEventListener("DISCONNECTED", (e) => processEvent(e), false);
            eventSourceList[haId].removeEventListener("KEEP-ALIVE", (e) => resetReconnectTimeout(e.lastEventId), false);
        }
        eventSourceList[haId] = new EventSource(baseUrl, header);
        // Error handling
        eventSourceList[haId].onerror = (err) => {
            adapter.log.error("EventSource error: " + JSON.stringify(err));
            if (err.status) {
                adapter.log.error(err.status + " " + err.message);
            } else {
                adapter.log.info("Undefined Error from Homeconnect this happens sometimes.");
            }
            if (err.status !== undefined) {
                adapter.log.error("Error (" + haId + ")", err);
                if (err.status === 401) {
                    getRefreshToken();
                    // Most likely the token has expired, try to refresh the token
                    adapter.log.info("Token abgelaufen");
                } else if (err.status === 429) {
                    adapter.log.warn("Too many requests. Adapter sends too many requests per minute. Please wait 1min before restart the instance.");
                } else {
                    adapter.log.error("Error: " + err.status);
                    adapter.log.error("Error: " + JSON.stringify(err));
                    if (err.status >= 500) {
                        adapter.log.error("Homeconnect API are not available please try again later");
                    }
                }
            }
        };
        eventSourceList[haId].addEventListener("STATUS", (e) => processEvent(e), false);
        eventSourceList[haId].addEventListener("NOTIFY", (e) => processEvent(e), false);
        eventSourceList[haId].addEventListener("EVENT", (e) => processEvent(e), false);
        eventSourceList[haId].addEventListener("CONNECTED", (e) => processEvent(e), false);
        eventSourceList[haId].addEventListener("DISCONNECTED", (e) => processEvent(e), false);
        eventSourceList[haId].addEventListener(
            "KEEP-ALIVE",
            (e) => {
                //adapter.log.debug(JSON.stringify(e));
                resetReconnectTimeout(e.lastEventId);
            },
            false
        );

        resetReconnectTimeout(haId);
    }

    function resetReconnectTimeout(haId) {
        haId = haId.replace(/\.?\-001*$/, "");
        clearInterval(reconnectTimeouts[haId]);
        reconnectTimeouts[haId] = setInterval(() => {
            stateGet(adapter.namespace + ".dev.token")
                .then((value) => {
                    adapter.log.debug("reconnect EventStream " + haId);
                    startEventStream(value, haId);
                })
                .catch(() => {
                    adapter.log.debug("No token found");
                });
        }, 70000);
    }

    //Eventstream ==>> Datenpunkt

    const processEvent = (msg) => {
        /*Auswertung des Eventstreams*/
        try {
            adapter.log.debug("event: " + JSON.stringify(msg));
            const stream = msg;
            const lastEventId = stream.lastEventId.replace(/\.?\-001*$/, "");
            if (!stream) {
                adapter.log.debug("No Return: " + stream);
                return;
            }
            resetReconnectTimeout(lastEventId);
            if (stream.type == "DISCONNECTED") {
                adapter.setState(lastEventId + ".general.connected", false, true);
                return;
            }
            if (stream.type == "CONNECTED") {
                adapter.setState(lastEventId + ".general.connected", true, true);
                if (adapter.config.disableFetchConnect) {
                    return;
                }
                const tokenID = adapter.namespace + ".dev.token";
                stateGet(tokenID)
                    .then(
                        (value) => {
                            const token = value;
                            getAPIValues(token, lastEventId, "/status");
                            getAPIValues(token, lastEventId, "/settings");
                            getAPIValues(token, lastEventId, "/programs");
                            getAPIValues(token, lastEventId, "/programs/active");
                            getAPIValues(token, lastEventId, "/programs/selected");
                            updateOptions(token, lastEventId, "/programs/active");
                            updateOptions(token, lastEventId, "/programs/selected");
                        },
                        (err) => {
                            adapter.log.error("FEHLER: " + err);
                        }
                    )
                    .catch(() => {
                        adapter.log.debug("No token found");
                    });
                return;
            }

            const parseMsg = msg.data;

            const parseMessage = JSON.parse(parseMsg);
            parseMessage.items.forEach((element) => {
                let haId = parseMessage.haId;
                haId = haId.replace(/\.?\-001*$/, "");
                let folder;
                let key;
                if (stream.type === "EVENT") {
                    folder = "events";
                    key = element.key.replace(/\./g, "_");
                } else {
                    folder = element.uri.split("/").splice(4);
                    if (folder[folder.length - 1].indexOf(".") != -1) {
                        folder.pop();
                    }
                    folder = folder.join(".");
                    key = element.key.replace(/\./g, "_");
                }
                adapter.log.debug(haId + "." + folder + "." + key + ":" + element.value);
                adapter
                    .setObjectNotExistsAsync(haId + "." + folder + "." + key, {
                        type: "state",
                        common: {
                            name: key,
                            type: "mixed",
                            role: "indicator",
                            write: true,
                            read: true,
                            unit: element.unit || "",
                        },
                        native: {},
                    })
                    .then(() => {
                        adapter.setState(haId + "." + folder + "." + key, element.value, true);
                    })
                    .catch(() => {
                        adapter.log.error("failed set state");
                    });
            });
        } catch (error) {
            adapter.log.error("Parsemessage: " + error);
            adapter.log.error("Error Event: " + msg);
        }
    };

    adapter.on("unload", function (callback) {
        try {
            adapter.log.info("cleaned everything up...");
            clearInterval(getTokenRefreshInterval);
            clearInterval(getTokenInterval);
            clearInterval(reconnectEventStreamInterval);
            clearTimeout(retryTimeout);
            clearTimeout(rateLimitTimeout);
            clearTimeout(restartTimeout);
            Object.keys(eventSourceList).forEach((haId) => {
                if (eventSourceList[haId]) {
                    console.log("Clean event " + haId);
                    eventSourceList[haId].close();
                    eventSourceList[haId].removeEventListener("STATUS", (e) => processEvent(e), false);
                    eventSourceList[haId].removeEventListener("NOTIFY", (e) => processEvent(e), false);
                    eventSourceList[haId].removeEventListener("EVENT", (e) => processEvent(e), false);
                    eventSourceList[haId].removeEventListener("CONNECTED", (e) => processEvent(e), false);
                    eventSourceList[haId].removeEventListener("DISCONNECTED", (e) => processEvent(e), false);
                    eventSourceList[haId].removeEventListener("KEEP-ALIVE", (e) => resetReconnectTimeout(e.lastEventId), false);
                }
            });
            callback();
        } catch (e) {
            callback();
        }
    });

    adapter.on("objectChange", function (id, obj) {
        adapter.log.info("objectChange " + id + " " + JSON.stringify(obj));
    });

    adapter.on("stateChange", function (id, state) {
        if (id == adapter.namespace + ".dev.devCode") {
            getTokenInterval = setInterval(getToken, 10000); // Polling bis Authorisation erfolgt ist
        }
        if (state && !state.ack) {
            const idArray = id.split(".");
            const command = idArray.pop().replace(/_/g, ".");
            const haId = idArray[2];
            if (!isNaN(state.val) && !isNaN(parseFloat(state.val))) {
                state.val = parseFloat(state.val);
            }
            if (state.val === "true") {
                state.val = true;
            }
            if (state.val === "false") {
                state.val = false;
            }
            if (id.indexOf(".commands.") !== -1) {
                adapter.log.debug(id + " " + state.val);
                if (id.indexOf("StopProgram") !== -1 && state.val) {
                    stateGet(adapter.namespace + ".dev.token")
                        .then((token) => {
                            deleteAPIValues(token, haId, "/programs/active");
                        })
                        .catch(() => {
                            adapter.log.debug("No token found");
                        });
                } else {
                    const data = {
                        data: {
                            key: command,
                            value: state.val,
                        },
                    };
                    stateGet(adapter.namespace + ".dev.token")
                        .then((token) => {
                            putAPIValues(token, haId, "/commands/" + command, data).catch(() => {
                                adapter.log.error("Put value failed " + haId + "/commands/" + command + JSON.stringify(data));
                                adapter.log.error("Original state " + id + " change: " + JSON.stringify(state));
                            });
                        })
                        .catch(() => {
                            adapter.log.debug("No token found");
                        });
                }
            }
            if (id.indexOf(".settings.") !== -1) {
                const data = {
                    data: {
                        key: command,
                        value: state.val,
                        type: command,
                    },
                };
                stateGet(adapter.namespace + ".dev.token")
                    .then((token) => {
                        putAPIValues(token, haId, "/settings/" + command, data).catch(() => {
                            adapter.log.error("Put settings failed " + haId + "/commands/" + command + JSON.stringify(data));
                        });
                    })
                    .catch(() => {
                        adapter.log.debug("No token found");
                    });
            }
            if (id.indexOf(".options.") !== -1) {
                const data = {
                    data: {
                        key: command,
                        value: state.val,
                    },
                };
                if (id.indexOf("selected") !== -1) {
                    idArray.pop();
                }
                const folder = idArray.slice(3, idArray.length).join("/");
                stateGet(adapter.namespace + ".dev.token")
                    .then((token) => {
                        putAPIValues(token, haId, "/" + folder + "/" + command, data).catch(() => {
                            adapter.log.error("Put folder failed " + haId + "/commands/" + command + JSON.stringify(data));
                        });
                    })
                    .catch(() => {
                        adapter.log.debug("No token found");
                    });
            }
            if (id.indexOf("BSH_Common_Root_") !== -1) {
                const pre = adapter.name + "." + adapter.instance;
                if (!state.val) {
                    adapter.log.warn("No state val: " + JSON.stringify(state));
                    return;
                }
                const key = state.val.split(".").pop();
                adapter.getStates(pre + "." + haId + ".programs.selected.options." + key + ".*", (err, states) => {
                    const allIds = Object.keys(states);
                    options = [];
                    allIds.forEach(function (keyName) {
                        if (keyName.indexOf("BSH_Common_Option_ProgramProgress") === -1 && keyName.indexOf("BSH_Common_Option_RemainingProgramTime") === -1) {
                            const idArray = keyName.split(".");
                            const commandOption = idArray.pop().replace(/_/g, ".");
                            if (
                                ((availableProgramOptions[state.val] && availableProgramOptions[state.val].includes(commandOption)) || commandOption === "BSH.Common.Option.StartInRelative") &&
                                states[keyName] !== null
                            ) {
                                if (commandOption === "BSH.Common.Option.StartInRelative" && command === "BSH.Common.Root.SelectedProgram") {
                                } else {
                                    options.push({
                                        key: commandOption,
                                        value: states[keyName].val,
                                    });
                                }
                            }
                        }
                    });

                    const data = {
                        data: {
                            key: state.val,
                            options: options,
                        },
                    };

                    if (id.indexOf("Active") !== -1) {
                        stateGet(adapter.namespace + ".dev.token")
                            .then((token) => {
                                putAPIValues(token, haId, "/programs/active", data)
                                    .catch(() => {
                                        adapter.log.info("Programm doesn't start with options. Try again without selected options.");
                                        putAPIValues(token, haId, "/programs/active", {
                                            data: {
                                                key: state.val,
                                            },
                                        }).catch(() => {
                                            adapter.log.error("Put active failed " + haId + state.val);
                                        });
                                    })
                                    .then(() => updateOptions(token, haId, "/programs/active"))
                                    .catch(() => {
                                        adapter.log.error("Error update active program");
                                    });
                            })
                            .catch(() => {
                                adapter.log.debug("No token found");
                            });
                    }
                    if (id.indexOf("Selected") !== -1) {
                        if (state.val) {
                            currentSelected[haId] = { key: state.val };
                            stateGet(adapter.namespace + ".dev.token")
                                .then((token) => {
                                    putAPIValues(token, haId, "/programs/selected", data)
                                        .then(
                                            () => {
                                                updateOptions(token, haId, "/programs/selected");
                                            },
                                            () => {
                                                adapter.log.warn("Setting selected program was not succesful");
                                            }
                                        )
                                        .catch(() => {
                                            adapter.log.debug("No program selected found");
                                        });
                                })
                                .catch(() => {
                                    adapter.log.error("Cannot get token");
                                });
                        } else {
                            adapter.log.warn("No state val: " + JSON.stringify(state));
                        }
                    }
                });
            }
        } else {
            const idArray = id.split(".");
            const command = idArray.pop().replace(/_/g, ".");
            const haId = idArray[2];
            if (id.indexOf("BSH_Common_Root_") !== -1) {
                if (id.indexOf("Active") !== -1) {
                    stateGet(adapter.namespace + ".dev.token")
                        .then((token) => {
                            updateOptions(token, haId, "/programs/active");
                        })
                        .catch(() => {
                            adapter.log.debug("No token found");
                        });
                }
                if (id.indexOf("Selected") !== -1) {
                    if (state && state.val) {
                        currentSelected[haId] = { key: state.val };
                    } else {
                        adapter.log.warn("Selected program is empty: " + JSON.stringify(state));
                    }
                    stateGet(adapter.namespace + ".dev.token")
                        .then((token) => {
                            updateOptions(token, haId, "/programs/selected");
                        })
                        .catch(() => {
                            adapter.log.debug("No token found");
                        });
                }
            }

            if (id.indexOf(".options.") !== -1 || id.indexOf(".events.") !== -1 || id.indexOf(".status.") !== -1) {
                if (id.indexOf("BSH_Common_Option") === -1 && state && state.val && state.val.indexOf && state.val.indexOf(".") !== -1) {
                    adapter.getObject(id, function (err, obj) {
                        if (obj) {
                            const common = obj.common;
                            const valArray = state.val.split(".");
                            common.states = {};
                            common.states[state.val] = valArray[valArray.length - 1];
                            adapter.log.silly("Extend common option: " + id);
                            adapter
                                .setObjectNotExistsAsync(id, {
                                    type: "state",
                                    common: common,
                                    native: {},
                                })
                                .then(() => {
                                    adapter.extendObject(id, {
                                        common: common,
                                    });
                                })
                                .catch(() => {
                                    adapter.log.error("failed set state");
                                });
                        }
                    });
                }
            }
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

    function updateOptions(token, haId, url) {
        const pre = adapter.name + "." + adapter.instance;
        adapter.getStates(pre + "." + haId + ".programs.*", (err, states) => {
            const allIds = Object.keys(states);
            let searchString = "selected.options.";
            if (url.indexOf("/active") !== -1) {
                searchString = "active.options.";
                adapter.log.debug(searchString);
                //delete only for active options
                adapter.log.debug("Delete: " + haId + url.replace(/\//g, ".") + ".options");
                allIds.forEach(function (keyName) {
                    if (keyName.indexOf(searchString) !== -1 && keyName.indexOf("BSH_Common_Option") === -1) {
                        adapter.delObject(keyName.split(".").slice(2).join("."));
                    }
                });
            }
            setTimeout(() => getAPIValues(token, haId, url + "/options"), 0);
        });
    }

    function parseHomeappliances(appliancesArray) {
        appliancesArray.data.homeappliances.forEach((element) => {
            // if (element.haId.indexOf("BOSCH-WTX87K80") === -1) {
            //     return;
            // }
            const haId = element.haId;
            adapter.log.silly("Extend Parse: " + haId);
            adapter.extendObject(haId, {
                type: "device",
                common: {
                    name: element.name,
                    type: "object",
                    role: "indicator",
                    write: false,
                    read: true,
                },
                native: {},
            });
            for (const key in element) {
                adapter
                    .setObjectNotExistsAsync(haId + ".general." + key, {
                        type: "state",
                        common: {
                            name: key,
                            type: typeof element[key],
                            role: "indicator",
                            write: false,
                            read: true,
                        },
                        native: {},
                    })
                    .then(() => {
                        adapter.setState(haId + ".general." + key, element[key], true);
                    })
                    .catch(() => {
                        adapter.log.error("failed set state");
                    });
            }
            adapter.extendObject(haId + ".commands.BSH_Common_Command_StopProgram", {
                type: "state",
                common: {
                    name: "Stop Program",
                    type: "boolean",
                    role: "button",
                    write: true,
                    read: true,
                },
                native: {},
            });
            adapter.extendObject(haId + ".commands.BSH_Common_Command_PauseProgram", {
                type: "state",
                common: {
                    name: "Pause Program",
                    type: "boolean",
                    role: "button",
                    write: true,
                    read: true,
                },
                native: {},
            });
            adapter.extendObject(haId + ".commands.BSH_Common_Command_ResumeProgram", {
                type: "state",
                common: {
                    name: "Resume Program",
                    type: "boolean",
                    role: "button",
                    write: true,
                    read: true,
                },
                native: {},
            });
            const tokenID = adapter.namespace + ".dev.token";
            stateGet(tokenID)
                .then(
                    (value) => {
                        const token = value;
                        if (element.connected) {
                            getAPIValues(token, haId, "/status");
                            getAPIValues(token, haId, "/settings");
                            getAPIValues(token, haId, "/programs");
                            getAPIValues(token, haId, "/programs/active");
                            getAPIValues(token, haId, "/programs/selected");
                            updateOptions(token, haId, "/programs/active");
                            updateOptions(token, haId, "/programs/selected");
                        }
                        startEventStream(token, haId);
                    },
                    (err) => {
                        adapter.log.error("FEHLER: " + err);
                    }
                )
                .catch(() => {
                    adapter.log.debug("No token found");
                });
        });
        //Delete old states
        adapter.getStates("*", (err, states) => {
            const allIds = Object.keys(states);
            allIds.forEach(function (keyName) {
                if (
                    keyName.indexOf(".Event.") !== -1 ||
                    keyName.indexOf(".General.") !== -1 ||
                    keyName.indexOf(".Option.") !== -1 ||
                    keyName.indexOf(".Root.") !== -1 ||
                    keyName.indexOf(".Setting.") !== -1 ||
                    keyName.indexOf(".Status.") !== -1
                ) {
                    adapter.delObject(keyName.split(".").slice(2).join("."));
                }
            });
        });
    }

    function putAPIValues(token, haId, url, data) {
        return /** @type {Promise<void>} */ (
            new Promise((resolve, reject) => {
                adapter.log.debug(haId + url);
                adapter.log.debug(JSON.stringify(data));
                sendRequest(token, haId, url, "PUT", JSON.stringify(data))
                    .then(
                        ([statusCode, returnValue]) => {
                            adapter.log.debug(statusCode + " " + returnValue);
                            adapter.log.debug(JSON.stringify(returnValue));
                            resolve();
                        },
                        ([statusCode, description]) => {
                            if (statusCode === 403) {
                                adapter.log.info("Homeconnect API has not the rights for this command and device");
                            }
                            adapter.log.info(statusCode + ": " + description);
                            reject();
                        }
                    )
                    .catch(() => {
                        adapter.log.debug("request not successful found");
                    });
            })
        );
    }

    function deleteAPIValues(token, haId, url) {
        sendRequest(token, haId, url, "DELETE")
            .then(
                ([statusCode, returnValue]) => {
                    adapter.log.debug(url);
                    adapter.log.debug(JSON.stringify(returnValue));
                },
                ([statusCode, description]) => {
                    if (statusCode === 403) {
                        adapter.log.info("Homeconnect API has not the rights for this command and device");
                    }
                    adapter.log.info(statusCode + ": " + description);
                }
            )
            .catch(() => {
                adapter.log.debug("delete not successful");
            });
    }

    function getAPIValues(token, haId, url) {
        sendRequest(token, haId, url)
            .then(
                ([statusCode, returnValue]) => {
                    try {
                        adapter.log.debug(url);
                        adapter.log.debug(JSON.stringify(returnValue));
                        if (url.indexOf("/settings/") !== -1) {
                            let type = "string";
                            if (returnValue.data.type === "Int" || returnValue.data.type === "Double") {
                                type = "number";
                            }
                            if (returnValue.data.type === "Boolean") {
                                type = "boolean";
                            }
                            const common = {
                                name: returnValue.data.name,
                                type: type,
                                role: "indicator",
                                write: true,
                                read: true,
                            };
                            if (returnValue.data.constraints && returnValue.data.constraints.allowedvalues) {
                                const states = {};
                                returnValue.data.constraints.allowedvalues.forEach((element, index) => {
                                    states[element] = returnValue.data.constraints.displayvalues[index];
                                });
                                common.states = states;
                            }
                            const folder = ".settings." + returnValue.data.key.replace(/\./g, "_");
                            adapter.log.silly("Extend Settings: " + haId + folder);
                            adapter.extendObject(haId + folder, {
                                type: "state",
                                common: common,
                                native: {},
                            });
                            return;
                        }

                        if (url.indexOf("/programs/available/") !== -1) {
                            if (returnValue.data.options) {
                                availableProgramOptions[returnValue.data.key] = availableProgramOptions[returnValue.data.key] || [];
                                returnValue.data.options.forEach(async (option) => {
                                    availableProgramOptions[returnValue.data.key].push(option.key);
                                    let type = "string";
                                    if (option.type === "Int" || option.type === "Double") {
                                        type = "number";
                                    }
                                    if (option.type === "Boolean") {
                                        type = "boolean";
                                    }
                                    const common = {
                                        name: option.name,
                                        type: type,
                                        role: "indicator",
                                        unit: option.unit || "",
                                        write: true,
                                        read: true,
                                    };
                                    if (option.constraints.min) {
                                        common.min = option.constraints.min;
                                    }
                                    if (option.constraints.max) {
                                        common.max = option.constraints.max;
                                    }

                                    if (option.constraints.allowedvalues) {
                                        common.states = {};
                                        option.constraints.allowedvalues.forEach((element, index) => {
                                            common.states[element] = option.constraints.displayvalues[index];
                                        });
                                    }
                                    let folder = ".programs.available.options." + option.key.replace(/\./g, "_");
                                    adapter.log.silly("Extend Options: " + haId + folder);
                                    await adapter
                                        .setObjectNotExistsAsync(haId + folder, {
                                            type: "state",
                                            common: common,
                                            native: {},
                                        })
                                        .catch(() => {
                                            adapter.log.error("failed set state");
                                        });

                                    adapter.extendObject(haId + folder, {
                                        type: "state",
                                        common: common,
                                        native: {},
                                    });
                                    adapter.setState(haId + folder, option.constraints.default, true);
                                    const key = returnValue.data.key.split(".").pop();
                                    adapter
                                        .setObjectNotExistsAsync(haId + ".programs.selected.options." + key, {
                                            type: "state",
                                            common: { name: returnValue.data.name, type: "mixed", role: "indicator", write: true, read: true },
                                            native: {},
                                        })
                                        .then(() => {
                                            folder = ".programs.selected.options." + key + "." + option.key.replace(/\./g, "_");
                                            adapter.extendObject(haId + folder, {
                                                type: "state",
                                                common: common,
                                                native: {},
                                            });
                                        })
                                        .catch(() => {
                                            adapter.log.error("failed set state");
                                        });
                                });
                            }
                            return;
                        }

                        if ("key" in returnValue.data) {
                            returnValue.data = {
                                items: [returnValue.data],
                            };
                        }
                        for (const item in returnValue.data) {
                            returnValue.data[item].forEach(async (subElement) => {
                                let folder = url.replace(/\//g, ".");
                                if (url === "/programs/active") {
                                    subElement.value = subElement.key;
                                    subElement.key = "BSH_Common_Root_ActiveProgram";
                                    subElement.name = "BSH_Common_Root_ActiveProgram";
                                }
                                if (url === "/programs/selected") {
                                    if (subElement.key) {
                                        subElement.value = subElement.key;
                                        currentSelected[haId] = { key: subElement.value, name: subElement.name };
                                        subElement.key = "BSH_Common_Root_SelectedProgram";
                                        subElement.name = "BSH_Common_Root_SelectedProgram";
                                    } else {
                                        adapter.log.warn("Empty sublement: " + JSON.stringify(subElement));
                                    }
                                }
                                if (url === "/programs") {
                                    adapter.log.debug(haId + " available: " + JSON.stringify(subElement));
                                    if (availablePrograms[haId]) {
                                        availablePrograms[haId].push({
                                            key: subElement.key,
                                            name: subElement.name,
                                        });
                                    } else {
                                        availablePrograms[haId] = [
                                            {
                                                key: subElement.key,
                                                name: subElement.name,
                                            },
                                        ];
                                    }
                                    getAPIValues(token, haId, "/programs/available/" + subElement.key);
                                    folder += ".available";
                                }
                                if (url === "/settings") {
                                    getAPIValues(token, haId, "/settings/" + subElement.key);
                                }

                                if (url.indexOf("/programs/selected/") !== -1) {
                                    if (!currentSelected[haId]) {
                                        return;
                                    }
                                    if (!currentSelected[haId].key) {
                                        adapter.log.warn(JSON.stringify(currentSelected[haId]) + " is selected but has no key selected ");
                                        return;
                                    }
                                    const key = currentSelected[haId].key.split(".").pop();
                                    folder += "." + key;

                                    await adapter
                                        .setObjectNotExistsAsync(haId + folder, {
                                            type: "state",
                                            common: { name: currentSelected[haId].name, type: "mixed", role: "indicator", write: true, read: true },
                                            native: {},
                                        })
                                        .catch(() => {
                                            adapter.log.error("failed set state");
                                        });
                                }
                                adapter.log.debug("Create State: " + haId + folder + "." + subElement.key.replace(/\./g, "_"));
                                let type = "mixed";
                                if (typeof subElement.value === "boolean") {
                                    type = "boolean";
                                }
                                if (typeof subElement.value === "number") {
                                    type = "number";
                                }
                                const common = {
                                    name: subElement.name,
                                    type: type,
                                    role: "indicator",
                                    write: true,
                                    read: true,
                                    unit: subElement.unit || "",
                                };

                                if (subElement.constraints && subElement.constraints.min) {
                                    common.min = subElement.constraints.min;
                                }
                                if (subElement.constraints && subElement.constraints.max) {
                                    common.max = subElement.constraints.max;
                                }
                                adapter
                                    .setObjectNotExistsAsync(haId + folder + "." + subElement.key.replace(/\./g, "_"), {
                                        type: "state",
                                        common: common,
                                        native: {},
                                    })
                                    .then(() => {
                                        if (subElement.value !== undefined) {
                                            adapter.setState(haId + folder + "." + subElement.key.replace(/\./g, "_"), subElement.value, true);
                                        }
                                    })
                                    .catch(() => {
                                        adapter.log.error("failed set state");
                                    });
                            });
                        }
                        if (url === "/programs") {
                            const rootItems = [
                                {
                                    key: "BSH_Common_Root_ActiveProgram",
                                    folder: ".programs.active",
                                },
                                {
                                    key: "BSH_Common_Root_SelectedProgram",
                                    folder: ".programs.selected",
                                },
                            ];
                            if (!availablePrograms[haId]) {
                                adapter.log.info("No available programs found for: " + haId);
                                return;
                            }
                            rootItems.forEach((rootItem) => {
                                const common = {
                                    name: rootItem.key,
                                    type: "string",
                                    role: "indicator",
                                    write: true,
                                    read: true,
                                    states: {},
                                };
                                availablePrograms[haId].forEach((program) => {
                                    common.states[program.key] = program.name;
                                });
                                adapter
                                    .setObjectNotExistsAsync(haId + rootItem.folder + "." + rootItem.key.replace(/\./g, "_"), {
                                        type: "state",
                                        common: common,
                                        native: {},
                                    })
                                    .then(() => {
                                        adapter.extendObject(haId + rootItem.folder + "." + rootItem.key.replace(/\./g, "_"), {
                                            type: "state",
                                            common: common,
                                            native: {},
                                        });
                                    })
                                    .catch(() => {
                                        adapter.log.error("failed set state");
                                    });
                            });
                        }
                    } catch (error) {
                        adapter.log.error(error);
                        adapter.log.error(error.stack);
                        adapter.log.error(url);
                        adapter.log.error(JSON.stringify(returnValue));
                    }
                },
                ([statusCode, description]) => {
                    // adapter.log.info("Error getting API Values Error: " + statusGet);
                    adapter.log.info(haId + ": " + description);
                }
            )
            .catch(() => {
                adapter.log.debug("request not succesfull");
            });
    }

    function sendRequest(token, haId, url, method, data) {
        method = method || "GET";

        const param = {
            Authorization: "Bearer " + token,
            Accept: "application/vnd.bsh.sdk.v1+json, application/vnd.bsh.sdk.v2+json, application/json, application/vnd.bsh.hca.v2+json, application/vnd.bsh.sdk.v1+json, application/vnd",
            "Accept-Language": "de-DE",
        };
        if (method === "PUT" || method === "DELETE") {
            param["Content-Type"] = "application/vnd.bsh.sdk.v1+json";
        }
        return new Promise((resolve, reject) => {
            const now = Date.now();
            let timeout = 0;

            let i = 0;
            while (i < rateCalculation.length) {
                if (now - rateCalculation[i] < 60000) {
                    break;
                }
                i++;
            }
            if (i) {
                if (i < rateCalculation.length) {
                    rateCalculation.splice(0, i);
                } else {
                    rateCalculation = [];
                }
            }

            if (rateCalculation.length > 2) {
                timeout = rateCalculation.length * 1500;
            }

            adapter.log.debug("Rate per min: " + rateCalculation.length);
            rateCalculation.push(now);
            rateLimitTimeout = setTimeout(() => {
                request(
                    {
                        method: method,
                        url: "https://api.home-connect.com/api/homeappliances/" + haId + url,
                        headers: param,
                        body: data,
                    },

                    function (error, response, body) {
                        const responseCode = response ? response.statusCode : null;
                        if (error) {
                            reject([responseCode, error]);
                            return;
                        }
                        if (!error && responseCode >= 300) {
                            try {
                                const errorString = JSON.parse(body);
                                const description = errorString.error.description;
                                reject([responseCode, description]);
                            } catch (error) {
                                const description = body;
                                reject([responseCode, description]);
                            }
                        } else {
                            try {
                                const parsedResponse = JSON.parse(body);
                                resolve([responseCode, parsedResponse]);
                            } catch (error) {
                                resolve([responseCode, body]);
                            }
                        }
                    }
                );
            }, timeout);
        });
    }

    async function main() {
        if (!adapter.config.clientID) {
            adapter.log.error("Client ID not specified!");
        }

        if (adapter.config.resetAccess) {
            adapter.log.info("Reset access");
            adapter.setState("dev.authUriComplete", "", true);
            adapter.setState("dev.devCode", "", true);
            adapter.setState("dev.access", false, true);
            adapter.setState("dev.token", "", true);
            adapter.setState("dev.refreshToken", "", true);
            adapter.setState("dev.expires", "", true);
            adapter.setState("dev.tokenScope", "", true);
            const adapterConfig = "system.adapter." + adapter.name + "." + adapter.instance;
            adapter.getForeignObject(adapterConfig, (error, obj) => {
                if (obj) {
                    obj.native.authUri = "";
                    obj.native.clientID = "";
                    obj.native.resetAccess = false;
                    adapter.setForeignObject(adapterConfig, obj);
                } else {
                    adapter.log.error("No reset possible no Adapterconfig found");
                }
            });
            return;
        }

        if (!adapter.config.updateCleanup) {
            const pre = adapter.name + "." + adapter.instance;
            adapter.getStates(pre + ".*", (err, states) => {
                const allIds = Object.keys(states);
                const searchString = "selected.options.";
                allIds.forEach(function (keyName) {
                    if (keyName.indexOf(searchString) !== -1) {
                        adapter.delObject(keyName.split(".").slice(2).join("."));
                    }
                });
                const adapterConfig = "system.adapter." + adapter.name + "." + adapter.instance;
                adapter.getForeignObject(adapterConfig, (error, obj) => {
                    if (obj) {
                        obj.native.updateCleanup = true;
                    }
                    //  adapter.setForeignObject(adapterConfig, obj);
                });
            });
        }
        //OAuth2 Deviceflow
        //Get Authorization-URI to grant access ===> User interaction

        const scope = adapter.config.scope;
        const clientID = adapter.config.clientID;

        stateGet(adapter.namespace + ".dev.devCode")
            .then((value) => {
                if (value == false) {
                    auth.authUriGet(scope, clientID)
                        .then(
                            ([authUri, devCode, pollInterval]) => {
                                adapter.setState("dev.authUriComplete", authUri, true);
                                adapter.setState("dev.devCode", devCode, true);
                                adapter.setState("dev.pollInterval", pollInterval, true);
                                const adapterConfig = "system.adapter." + adapter.name + "." + adapter.instance;
                                adapter.getForeignObject(adapterConfig, (error, obj) => {
                                    if (!obj.native.authUri) {
                                        obj.native.authUri = authUri;
                                        adapter.setForeignObject(adapterConfig, obj);
                                    }
                                });
                            },
                            (statusPost) => {
                                adapter.log.error("Error AuthUriGet: " + statusPost);
                            }
                        )
                        .catch(() => {
                            adapter.log.debug("auth uri not successfull");
                        });
                } else {
                    stateGet(adapter.namespace + ".dev.token")
                        .then(
                            (value) => {
                                if (!value) {
                                    getTokenInterval = setInterval(getToken, 10000);
                                } else {
                                    const token = value;
                                    auth.getAppliances(token)
                                        .then(
                                            (appliances) => {
                                                parseHomeappliances(appliances);
                                            },

                                            ([statusCode, description]) => {
                                                let desc = description.replace(" seconds", "");

                                                // sec to hhmmss
                                                const descInd = desc.indexOf("of");
                                                const delTime = desc.substring(descInd + 3);
                                                const hhmmss = secondstotime(delTime);

                                                desc = desc.replace(delTime, "");
                                                description = `${desc} ${hhmmss}`;

                                                adapter.log.error(`Error getting Aplliances with existing Token: ${statusCode}  ${description} `);
                                                adapter.log.warn("Restart the Adapter to get all devices correctly.");

                                                if (statusCode === 401) {
                                                    if (description && description.indexOf("malformed") !== -1) {
                                                        adapter.log.warn(
                                                            "The Homeconnect API is not reachable, the adapter will restart until the API is reachable. Please do not reset the Token while the Homeconnect API is not reachable."
                                                        );
                                                    } else {
                                                        adapter.log.warn("If Restart is not working please reset the Token in the settings.");
                                                    }
                                                }
                                                if (statusCode === 503) {
                                                    adapter.log.warn("Homeconnect is not reachable please wait until the service is up again.");
                                                }
                                                restartTimeout = setTimeout(() => adapter.restart(), 2000);
                                            }
                                        )
                                        .catch(() => {
                                            adapter.log.debug("No appliance found");
                                        });
                                    stateGet(adapter.namespace + ".dev.refreshToken")
                                        .then((refreshToken) => {
                                            getRefreshToken(true);
                                            getTokenRefreshInterval = setInterval(getRefreshToken, 20 * 60 * 60 * 1000); //every 20h
                                        })
                                        .catch(() => {
                                            adapter.log.debug("Not able to get refresh token");
                                        });
                                }
                            },
                            (err) => {
                                adapter.log.error("FEHLER: " + err);
                            }
                        )
                        .catch(() => {
                            adapter.log.debug("No token found");
                        });
                }
            })
            .catch(() => {
                adapter.log.debug("No token found");
            });

        await adapter.setObjectNotExistsAsync("dev.authUriComplete", {
            type: "state",
            common: {
                name: "AuthorizationURI",
                type: "mixed",
                role: "indicator",
                write: false,
                read: true,
            },
            native: {},
        });

        await adapter.setObjectNotExistsAsync("dev.devCode", {
            type: "state",
            common: {
                name: "DeviceCode",
                type: "mixed",
                role: "indicator",
                write: false,
                read: true,
            },
            native: {},
        });

        await adapter.setObjectNotExistsAsync("dev.pollInterval", {
            type: "state",
            common: {
                name: "Poll-Interval in sec.",
                type: "mixed",
                role: "indicator",
                write: false,
                read: true,
            },
            native: {},
        });

        await adapter.setObjectNotExistsAsync("dev.token", {
            type: "state",
            common: {
                name: "Access-Token",
                type: "mixed",
                role: "indicator",
                write: false,
                read: true,
            },
            native: {},
        });

        await adapter.setObjectNotExistsAsync("dev.refreshToken", {
            type: "state",
            common: {
                name: "Refresh-Token",
                type: "mixed",
                role: "indicator",
                write: false,
                read: true,
            },
            native: {},
        });

        await adapter.setObjectNotExistsAsync("dev.access", {
            type: "state",
            common: {
                name: "access",
                type: "boolean",
                role: "indicator",
                write: true,
                read: true,
            },
            native: {},
        });

        await adapter.setObjectNotExistsAsync("dev.expires", {
            type: "state",
            common: {
                name: "Token expires in sec",
                type: "number",
                role: "indicator",
                write: false,
                read: true,
            },
            native: {},
        });

        await adapter.setObjectNotExistsAsync("dev.tokenScope", {
            type: "state",
            common: {
                name: "Scope",
                type: "mixed",
                role: "indicator",
                write: false,
                read: true,
            },
            native: {},
        });

        await adapter.setObjectNotExistsAsync("dev.eventStreamJSON", {
            type: "state",
            common: {
                name: "Eventstream_JSON",
                type: "object",
                role: "indicator",
                write: false,
                read: true,
            },
            native: {},
        });

        adapter.subscribeStates("*");
    }
    function secondstotime(totalSeconds) {
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds - hours * 3600) / 60);
        let seconds = totalSeconds - hours * 3600 - minutes * 60;

        // round seconds
        seconds = Math.round(seconds * 100) / 100;

        let result = hours < 10 ? "0" + hours : hours;
        result += ":" + (minutes < 10 ? "0" + minutes : minutes);
        result += ":" + (seconds < 10 ? "0" + seconds : seconds);

        return result;
    }
    return adapter;
}
// If started as allInOne/compact mode => return function to create instance
if (module && module.parent) {
    module.exports = startAdapter;
} else {
    // or start the instance directly
    startAdapter();
}
