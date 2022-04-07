"use strict";

/*
 * Created with @iobroker/create-adapter v2.1.1
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const utils = require("@iobroker/adapter-core");
const axios = require("axios");
const rateLimit = require("axios-rate-limit");
const qs = require("qs");
const EventSource = require("eventsource");
class Homeconnect extends utils.Adapter {
    /**
     * @param {Partial<utils.AdapterOptions>} [options={}]
     */
    constructor(options) {
        super({
            ...options,
            name: "homeconnect",
        });
        this.on("ready", this.onReady.bind(this));
        this.on("stateChange", this.onStateChange.bind(this));
        this.on("unload", this.onUnload.bind(this));
        this.headers = {
            "user-agent": this.userAgent,
            Accept: "application/vnd.bsh.sdk.v1+json",
            "Accept-Language": "de-DE",
        };
        this.deviceArray = [];
        this.fetchedDevice = {};

        this.availablePrograms = {};
        this.availableProgramOptions = {};
        this.eventSourceState;

        this.currentSelected = {};
    }

    /**
     * Is called when databases are connected and adapter received configuration.
     */
    async onReady() {
        // Reset the connection indicator during startup
        this.setState("info.connection", false, true);

        this.userAgent = "ioBroker v1.0.0";
        const axiosClient = axios.create();
        this.requestClient = rateLimit(axiosClient, { maxRequests: 50, perMilliseconds: 60000 });

        this.reLoginTimeout = null;
        this.refreshTokenTimeout = null;
        this.session = {};
        this.subscribeStates("*");
        const sessionState = await this.getStateAsync("auth.session");

        if (sessionState && sessionState.val) {
            this.log.debug("Found current session");
            this.session = JSON.parse(sessionState.val);
        } else {
            const refreshToken = await this.getStateAsync("dev.refreshToken");
            if (refreshToken && refreshToken.val) {
                this.log.debug("Found old refreshtoken");
                this.session.refresh_token = refreshToken.val;
            }
        }

        if (this.session.refresh_token) {
            await this.refreshToken();
        } else {
            if (!this.config.username || !this.config.password || !this.config.clientID) {
                this.log.warn("please enter homeconnect app username and password and clientId in the instance settings");
                return;
            }

            this.log.debug("Start normal login");
            await this.login();
        }
        if (this.session.access_token) {
            this.headers.authorization = "Bearer " + this.session.access_token;
            await this.getDeviceList();
            await this.startEventStream();

            this.refreshTokenInterval = setInterval(() => {
                this.refreshToken();
            }, (this.session.expires_in - 200) * 1000);
        }
    }
    async login() {
        const deviceAuth = await this.requestClient({
            method: "post",
            url: "https://api.home-connect.com/security/oauth/device_authorization",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
            },
            data: "client_id=" + this.config.clientID + "&scope=IdentifyAppliance%20Monitor%20Settings%20Control",
        })
            .then((res) => {
                this.log.debug(JSON.stringify(res.data));
                return res.data;
            })
            .catch((error) => {
                this.log.error(error);
                if (error.response) {
                    this.log.error(JSON.stringify(error.response.data));
                }
            });
        if (!deviceAuth.verification_uri_complete) {
            this.log.error("No verification_uri_complete in device_authorization");
            return;
        }

        const formData = await this.requestClient({
            method: "post",
            url: deviceAuth.verification_uri_complete,
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
            },

            data: qs.stringify({
                user_code: deviceAuth.user_code,
                client_id: this.config.clientID,
                accept_language: "de",
                region: "EU",
                environment: "PRD",
                email: this.config.username,
                password: this.config.password,
            }),
        })
            .then((res) => {
                this.log.debug(JSON.stringify(res.data));
                return this.extractHidden(res.data);
            })
            .catch((error) => {
                this.log.error(error);
                if (error.response) {
                    this.log.error(JSON.stringify(error.response.data));
                }
            });

        await this.requestClient({
            method: "post",
            url: "https://api.home-connect.com/security/oauth/device_grant",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
            },

            data: qs.stringify(formData),
        })
            .then((res) => {
                this.log.debug(JSON.stringify(res.data));
                return;
            })
            .catch((error) => {
                this.log.error(error);
                if (error.response) {
                    this.log.error(JSON.stringify(error.response.data));
                }
            });
        await this.sleep(6000);
        await this.requestClient({
            method: "post",
            url: "https://api.home-connect.com/security/oauth/token",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
            },

            data: qs.stringify({
                grant_type: "device_code",
                device_code: deviceAuth.device_code,
                client_id: this.config.clientID,
            }),
        })
            .then((res) => {
                this.log.debug(JSON.stringify(res.data));
                this.session = res.data;
                this.setState("info.connection", true, true);
            })
            .catch((error) => {
                this.log.error(error);
                if (error.response) {
                    this.log.error(JSON.stringify(error.response.data));
                }
            });
    }
    async getDeviceList() {
        this.deviceArray = [];
        this.log.debug("Get device list");
        await this.requestClient({
            method: "get",
            url: "https://api.home-connect.com/api/homeappliances",
            headers: this.headers,
        })
            .then(async (res) => {
                this.log.debug(JSON.stringify(res.data));
                for (const device of res.data.data.homeappliances) {
                    const haID = device.haId;
                    this.deviceArray.push(haID);
                    const name = device.name;

                    await this.setObjectNotExistsAsync(haID, {
                        type: "device",
                        common: {
                            name: name,
                        },
                        native: {},
                    });
                    await this.setObjectNotExistsAsync(haID + ".commands", {
                        type: "channel",
                        common: {
                            name: "Commands",
                        },
                        native: {},
                    });
                    await this.setObjectNotExistsAsync(haID + ".general", {
                        type: "channel",
                        common: {
                            name: "General Information",
                        },
                        native: {},
                    });

                    const remoteArray = [
                        { command: "BSH_Common_Command_PauseProgram", name: "True = Pause" },
                        { command: "BSH_Common_Command_ResumeProgram", name: "True = Resume" },
                        { command: "BSH_Common_Command_StopProgram", name: "True = Stop" },
                    ];
                    remoteArray.forEach((remote) => {
                        this.setObjectNotExists(device.vin + ".commands." + remote.command, {
                            type: "state",
                            common: {
                                name: remote.name || "",
                                type: remote.type || "boolean",
                                role: remote.role || "boolean",
                                write: true,
                                read: true,
                            },
                            native: {},
                        });
                    });
                    for (const key in device) {
                        await this.setObjectNotExistsAsync(haID + ".general." + key, {
                            type: "state",
                            common: {
                                name: key,
                                type: typeof device[key],
                                role: "indicator",
                                write: false,
                                read: true,
                            },
                            native: {},
                        });
                        this.setState(haID + ".general." + key, device[key], true);
                    }
                    this.fetchDeviceInformation(haID);
                }
            })
            .catch((error) => {
                this.log.error(error);
                error.response && this.log.error(JSON.stringify(error.response.data));
            });
    }

    async fetchDeviceInformation(haId) {
        this.getAPIValues(haId, "/status");
        this.getAPIValues(haId, "/settings");
        this.getAPIValues(haId, "/programs/active");
        this.getAPIValues(haId, "/programs/selected");
        if (!this.fetchedDevice[haId]) {
            this.fetchedDevice[haId] = true;
            this.getAPIValues(haId, "/programs");
            this.updateOptions(haId, "/programs/active");
            this.updateOptions(haId, "/programs/selected");
        }
    }
    async getAPIValues(haId, url) {
        const returnValue = await this.requestClient({
            method: "get",
            url: "https://api.home-connect.com/api/homeappliances/" + haId + url,
            headers: this.headers,
        })
            .then((res) => {
                this.log.info(JSON.stringify(res.data));
                return res.data;
            })
            .catch((error) => {
                this.log.error(error);
                if (error.response) {
                    this.log.error(JSON.stringify(error.response.data));
                }
            });

        try {
            this.log.debug(url);
            this.log.debug(JSON.stringify(returnValue));
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
                this.log.silly("Extend Settings: " + haId + folder);
                this.extendObject(haId + folder, {
                    type: "state",
                    common: common,
                    native: {},
                });
                return;
            }

            if (url.indexOf("/programs/available/") !== -1) {
                if (returnValue.data.options) {
                    this.availableProgramOptions[returnValue.data.key] = this.availableProgramOptions[returnValue.data.key] || [];
                    returnValue.data.options.forEach(async (option) => {
                        this.availableProgramOptions[returnValue.data.key].push(option.key);
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
                        this.log.silly("Extend Options: " + haId + folder);
                        await this.setObjectNotExistsAsync(haId + folder, {
                            type: "state",
                            common: common,
                            native: {},
                        }).catch(() => {
                            this.log.error("failed set state");
                        });

                        this.extendObject(haId + folder, {
                            type: "state",
                            common: common,
                            native: {},
                        });
                        this.setState(haId + folder, option.constraints.default, true);
                        const key = returnValue.data.key.split(".").pop();
                        this.setObjectNotExistsAsync(haId + ".programs.selected.options." + key, {
                            type: "state",
                            common: { name: returnValue.data.name, type: "mixed", role: "indicator", write: true, read: true },
                            native: {},
                        })
                            .then(() => {
                                folder = ".programs.selected.options." + key + "." + option.key.replace(/\./g, "_");
                                this.extendObject(haId + folder, {
                                    type: "state",
                                    common: common,
                                    native: {},
                                });
                            })
                            .catch(() => {
                                this.log.error("failed set state");
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
                            this.currentSelected[haId] = { key: subElement.value, name: subElement.name };
                            subElement.key = "BSH_Common_Root_SelectedProgram";
                            subElement.name = "BSH_Common_Root_SelectedProgram";
                        } else {
                            this.log.warn("Empty sublement: " + JSON.stringify(subElement));
                        }
                    }
                    if (url === "/programs") {
                        this.log.debug(haId + " available: " + JSON.stringify(subElement));
                        if (this.availablePrograms[haId]) {
                            this.availablePrograms[haId].push({
                                key: subElement.key,
                                name: subElement.name,
                            });
                        } else {
                            this.availablePrograms[haId] = [
                                {
                                    key: subElement.key,
                                    name: subElement.name,
                                },
                            ];
                        }
                        this.getAPIValues(haId, "/programs/available/" + subElement.key);
                        folder += ".available";
                    }
                    if (url === "/settings") {
                        this.getAPIValues(haId, "/settings/" + subElement.key);
                    }

                    if (url.indexOf("/programs/selected/") !== -1) {
                        if (!this.currentSelected[haId]) {
                            return;
                        }
                        if (!this.currentSelected[haId].key) {
                            this.log.warn(JSON.stringify(this.currentSelected[haId]) + " is selected but has no key selected ");
                            return;
                        }
                        const key = this.currentSelected[haId].key.split(".").pop();
                        folder += "." + key;

                        await this.setObjectNotExistsAsync(haId + folder, {
                            type: "state",
                            common: { name: this.currentSelected[haId].name, type: "mixed", role: "indicator", write: true, read: true },
                            native: {},
                        }).catch(() => {
                            this.log.error("failed set state");
                        });
                    }
                    this.log.debug("Create State: " + haId + folder + "." + subElement.key.replace(/\./g, "_"));
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
                    this.setObjectNotExistsAsync(haId + folder + "." + subElement.key.replace(/\./g, "_"), {
                        type: "state",
                        common: common,
                        native: {},
                    })
                        .then(() => {
                            if (subElement.value !== undefined) {
                                this.setState(haId + folder + "." + subElement.key.replace(/\./g, "_"), subElement.value, true);
                            }
                        })
                        .catch(() => {
                            this.log.error("failed set state");
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
                if (!this.availablePrograms[haId]) {
                    this.log.info("No available programs found for: " + haId);
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
                    this.availablePrograms[haId].forEach((program) => {
                        common.states[program.key] = program.name;
                    });
                    this.setObjectNotExistsAsync(haId + rootItem.folder + "." + rootItem.key.replace(/\./g, "_"), {
                        type: "state",
                        common: common,
                        native: {},
                    })
                        .then(() => {
                            this.extendObject(haId + rootItem.folder + "." + rootItem.key.replace(/\./g, "_"), {
                                type: "state",
                                common: common,
                                native: {},
                            });
                        })
                        .catch(() => {
                            this.log.error("failed set state");
                        });
                });
            }
        } catch (error) {
            this.log.error(error);
            this.log.error(error.stack);
            this.log.error(url);
            this.log.error(JSON.stringify(returnValue));
        }
    }
    async updateOptions(haId, url) {
        const pre = this.name + "." + this.instance;
        const states = await this.getStatesAsync(pre + "." + haId + ".programs.*");
        const allIds = Object.keys(states);
        let searchString = "selected.options.";
        if (url.indexOf("/active") !== -1) {
            searchString = "active.options.";
            this.log.debug(searchString);
            //delete only for active options
            this.log.debug("Delete: " + haId + url.replace(/\//g, ".") + ".options");
            this.setState(haId + ".programs.active.options.BSH_Common_Option_RemainingProgramTime", 0, true);
            this.setState(haId + ".programs.active.options.BSH_Common_Option_ProgramProgress", 100, true);

            for (const keyName of allIds) {
                if (keyName.indexOf(searchString) !== -1 && keyName.indexOf("BSH_Common_Option") === -1) {
                    this.delObject(keyName.split(".").slice(2).join("."));
                }
            }
        }
        setTimeout(() => this.getAPIValues(haId, url + "/options"), 0);
    }
    async putAPIValues(haId, url, data) {
        await this.requestClient({
            method: "PUT",
            url: "https://api.home-connect.com/api/homeappliances/" + haId + url,
            headers: this.headers,
            data: data,
        })
            .then((res) => {
                this.log.info(JSON.stringify(res.data));
                return res.data;
            })
            .catch((error) => {
                this.log.error(error);
                if (error.response) {
                    if (error.response.status === 403) {
                        this.log.info("Homeconnect API has not the rights for this command and device");
                    }
                    this.log.error(JSON.stringify(error.response.data));
                }
            });
    }

    async deleteAPIValues(haId, url) {
        await this.requestClient({
            method: "DELETE",
            url: "https://api.home-connect.com/api/homeappliances/" + haId + url,
            headers: this.headers,
        })
            .then((res) => {
                this.log.info(JSON.stringify(res.data));
                return res.data;
            })
            .catch((error) => {
                this.log.error(error);
                if (error.response) {
                    if (error.response.status === 403) {
                        this.log.info("Homeconnect API has not the rights for this command and device");
                    }
                    this.log.error(JSON.stringify(error.response.data));
                }
            });
    }
    async startEventStream() {
        this.log.info("Start EventStream");
        const baseUrl = "https://api.home-connect.com/api/homeappliances/events";
        const header = {
            headers: {
                Authorization: "Bearer " + this.session.access_token,
                Accept: "text/event-stream",
            },
        };
        if (this.eventSourceState) {
            this.eventSourceState.close();
            this.eventSourceState.removeEventListener("PAIRED", (e) => this.processEvent(e), false);
            this.eventSourceState.removeEventListener("DEPAIRED", (e) => this.processEvent(e), false);
            this.eventSourceState.removeEventListener("STATUS", (e) => this.processEvent(e), false);
            this.eventSourceState.removeEventListener("NOTIFY", (e) => this.processEvent(e), false);
            this.eventSourceState.removeEventListener("EVENT", (e) => this.processEvent(e), false);
            this.eventSourceState.removeEventListener("CONNECTED", (e) => this.processEvent(e), false);
            this.eventSourceState.removeEventListener("DISCONNECTED", (e) => this.processEvent(e), false);
            this.eventSourceState.removeEventListener("KEEP-ALIVE", (e) => this.resetReconnectTimeout(e.lastEventId), false);
        }
        this.eventSourceState = new EventSource(baseUrl, header);
        // Error handling
        this.eventSourceState.onerror = (err) => {
            if (err.status) {
                this.log.error(err.status + " " + err.message);
            } else {
                this.log.debug("EventSource error: " + JSON.stringify(err));
                this.log.debug("Undefined Error from Homeconnect this happens sometimes.");
            }
            if (err.status !== undefined) {
                this.log.error("Error: " + JSON.stringify(err));
                if (err.status === 401) {
                    this.refreshToken();
                    // Most likely the token has expired, try to refresh the token
                    this.log.info("Token abgelaufen");
                } else if (err.status === 429) {
                    this.log.warn("Too many requests. Adapter sends too many requests per minute. Please wait 1min before restart the instance.");
                } else {
                    this.log.error("Error: " + err.status);
                    this.log.error("Error: " + JSON.stringify(err));
                    if (err.status >= 500) {
                        this.log.error("Homeconnect API are not available please try again later");
                    }
                }
            }
        };

        this.eventSourceState.addEventListener("PAIRED", (e) => this.processEvent(e), false);
        this.eventSourceState.addEventListener("DEPAIRED", (e) => this.processEvent(e), false);
        this.eventSourceState.addEventListener("STATUS", (e) => this.processEvent(e), false);
        this.eventSourceState.addEventListener("NOTIFY", (e) => this.processEvent(e), false);
        this.eventSourceState.addEventListener("EVENT", (e) => this.processEvent(e), false);
        this.eventSourceState.addEventListener("CONNECTED", (e) => this.processEvent(e), false);
        this.eventSourceState.addEventListener("DISCONNECTED", (e) => this.processEvent(e), false);
        this.eventSourceState.addEventListener(
            "KEEP-ALIVE",
            (e) => {
                this.resetReconnectTimeout();
            },
            false
        );

        this.resetReconnectTimeout();
    }
    resetReconnectTimeout() {
        this.reconnectTimeout && clearInterval(this.reconnectTimeout);
        this.reconnectTimeout = setInterval(() => {
            this.log.info("Keep Alive failed Reconnect EventStream");
            this.startEventStream();
        }, 70000);
    }

    processEvent(msg) {
        try {
            this.log.debug("event: " + JSON.stringify(msg));
            const stream = msg;
            const lastEventId = stream.lastEventId.replace(/\.?\-001*$/, "");
            if (!stream) {
                this.log.debug("No Return: " + stream);
                return;
            }
            this.resetReconnectTimeout();
            if (stream.type == "DISCONNECTED") {
                this.log.info("DISCONNECTED: " + lastEventId);
                this.setState(lastEventId + ".general.connected", false, true);
                return;
            }
            if (stream.type == "CONNECTED" || stream.type == "PAIRED") {
                this.log.info("CONNECTED: " + lastEventId);
                this.setState(lastEventId + ".general.connected", true, true);
                if (this.config.disableFetchConnect) {
                    return;
                }
                this.fetchDeviceInformation(lastEventId);
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
                this.log.debug(haId + "." + folder + "." + key + ":" + element.value);
                this.setObjectNotExistsAsync(haId + "." + folder + "." + key, {
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
                        this.setState(haId + "." + folder + "." + key, element.value, true);
                    })
                    .catch(() => {
                        this.log.error("failed set state");
                    });
            });
        } catch (error) {
            this.log.error("Parsemessage: " + error);
            this.log.error("Error Event: " + JSON.stringify(msg));
        }
    }

    async refreshToken() {
        if (!this.session) {
            this.log.error("No session found relogin");
            await this.login();
            return;
        }
        await this.requestClient({
            method: "post",
            url: "https://api.home-connect.com/security/oauth/token",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
            },
            data: "grant_type=refresh_token&refresh_token=" + this.session.refresh_token,
        })
            .then((res) => {
                this.log.debug(JSON.stringify(res.data));
                this.session = res.data;
                this.headers.authorization = "Bearer " + this.session.access_token;
                this.setState("info.connection", true, true);
            })
            .catch((error) => {
                this.log.error("refresh token failed");
                this.log.error(error);
                error.response && this.log.error(JSON.stringify(error.response.data));
                this.log.error("Start relogin in 10min");
                this.reLoginTimeout && clearTimeout(this.reLoginTimeout);
                this.reLoginTimeout = setTimeout(() => {
                    this.login();
                }, 1000 * 60 * 10);
            });
    }
    extractHidden(body) {
        const returnObject = {};
        const matches = this.matchAll(/<input (?=[^>]* name=["']([^'"]*)|)(?=[^>]* value=["']([^'"]*)|)/g, body);
        for (const match of matches) {
            returnObject[match[1]] = match[2];
        }
        return returnObject;
    }
    matchAll(re, str) {
        let match;
        const matches = [];

        while ((match = re.exec(str))) {
            // add all matched groups
            matches.push(match);
        }

        return matches;
    }
    sleep(ms) {
        if (this.adapterStopped) {
            ms = 0;
        }
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
    /**
     * Is called when adapter shuts down - callback has to be called under any circumstances!
     * @param {() => void} callback
     */
    onUnload(callback) {
        try {
            this.setState("info.connection", false, true);
            this.refreshTimeout && clearTimeout(this.refreshTimeout);
            this.reLoginTimeout && clearTimeout(this.reLoginTimeout);
            this.refreshTokenTimeout && clearTimeout(this.refreshTokenTimeout);
            this.updateInterval && clearInterval(this.updateInterval);
            this.refreshTokenInterval && clearInterval(this.refreshTokenInterval);

            if (this.eventSourceState) {
                this.eventSourceState.close();
                this.eventSourceState.removeEventListener("STATUS", (e) => this.processEvent(e), false);
                this.eventSourceState.removeEventListener("NOTIFY", (e) => this.processEvent(e), false);
                this.eventSourceState.removeEventListener("EVENT", (e) => this.processEvent(e), false);
                this.eventSourceState.removeEventListener("CONNECTED", (e) => this.processEvent(e), false);
                this.eventSourceState.removeEventListener("DISCONNECTED", (e) => this.processEvent(e), false);
                this.eventSourceState.removeEventListener("KEEP-ALIVE", (e) => this.resetReconnectTimeout(), false);
            }

            callback();
        } catch (e) {
            callback();
        }
    }

    /**
     * Is called if a subscribed state changes
     * @param {string} id
     * @param {ioBroker.State | null | undefined} state
     */
    async onStateChange(id, state) {
        if (state) {
            if (state && !state.ack) {
                const idArray = id.split(".") || [];
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
                    this.log.debug(id + " " + state.val);
                    if (id.indexOf("StopProgram") !== -1 && state.val) {
                        this.deleteAPIValues(haId, "/programs/active");
                    } else {
                        const data = {
                            data: {
                                key: command,
                                value: state.val,
                            },
                        };

                        this.putAPIValues(haId, "/commands/" + command, data).catch(() => {
                            this.log.error("Put value failed " + haId + "/commands/" + command + JSON.stringify(data));
                            this.log.error("Original state " + id + " change: " + JSON.stringify(state));
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

                    this.putAPIValues(haId, "/settings/" + command, data);
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

                    this.putAPIValues(haId, "/" + folder + "/" + command, data);
                }
                if (id.indexOf("BSH_Common_Root_") !== -1) {
                    const pre = this.name + "." + this.instance;
                    if (!state.val) {
                        this.log.warn("No state val: " + JSON.stringify(state));
                        return;
                    }
                    const key = state.val.split(".").pop();
                    this.getStates(pre + "." + haId + ".programs.selected.options." + key + ".*", (err, states) => {
                        const allIds = Object.keys(states);
                        const options = [];
                        allIds.forEach((keyName) => {
                            if (keyName.indexOf("BSH_Common_Option_ProgramProgress") === -1 && keyName.indexOf("BSH_Common_Option_RemainingProgramTime") === -1) {
                                const idArray = keyName.split(".");
                                const commandOption = idArray.pop().replace(/_/g, ".");
                                if (
                                    ((this.availableProgramOptions[state.val] && this.availableProgramOptions[state.val].includes(commandOption)) ||
                                        commandOption === "BSH.Common.Option.StartInRelative") &&
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
                            this.putAPIValues(haId, "/programs/active", data)
                                .catch(() => {
                                    this.log.info("Programm doesn't start with options. Try again without selected options.");
                                    this.putAPIValues(haId, "/programs/active", {
                                        data: {
                                            key: state.val,
                                        },
                                    }).catch(() => {
                                        this.log.error("Put active failed " + haId + state.val);
                                    });
                                })
                                .then(() => this.updateOptions(haId, "/programs/active"))
                                .catch(() => {
                                    this.log.error("Error update active program");
                                });
                        }
                        if (id.indexOf("Selected") !== -1) {
                            if (state.val) {
                                this.currentSelected[haId] = { key: state.val };

                                this.putAPIValues(haId, "/programs/selected", data)
                                    .then(
                                        () => {
                                            this.updateOptions(haId, "/programs/selected");
                                        },
                                        () => {
                                            this.log.warn("Setting selected program was not succesful");
                                        }
                                    )
                                    .catch(() => {
                                        this.log.debug("No program selected found");
                                    });
                            } else {
                                this.log.warn("No state val: " + JSON.stringify(state));
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
                        this.updateOptions(haId, "/programs/active");
                    }
                    if (id.indexOf("Selected") !== -1) {
                        if (state && state.val) {
                            this.currentSelected[haId] = { key: state.val };
                        } else {
                            this.log.debug("Selected program is empty: " + JSON.stringify(state));
                        }

                        this.updateOptions(haId, "/programs/selected");
                    }
                }

                if (id.indexOf(".options.") !== -1 || id.indexOf(".events.") !== -1 || id.indexOf(".status.") !== -1) {
                    if (id.indexOf("BSH_Common_Option") === -1 && state && state.val && state.val.indexOf && state.val.indexOf(".") !== -1) {
                        this.getObject(id, (err, obj) => {
                            if (obj) {
                                const common = obj.common;
                                const valArray = state.val.split(".");
                                common.states = {};
                                common.states[state.val] = valArray[valArray.length - 1];
                                this.log.silly("Extend common option: " + id);
                                this.setObjectNotExistsAsync(id, {
                                    type: "state",
                                    common: common,
                                    native: {},
                                })
                                    .then(() => {
                                        this.extendObject(id, {
                                            common: common,
                                        });
                                    })
                                    .catch(() => {
                                        this.log.error("failed set state");
                                    });
                            }
                        });
                    }
                }
            }
        }
    }
}

if (require.main !== module) {
    // Export the constructor in compact mode
    /**
     * @param {Partial<utils.AdapterOptions>} [options={}]
     */
    module.exports = (options) => new Homeconnect(options);
} else {
    // otherwise start the instance directly
    new Homeconnect();
}
