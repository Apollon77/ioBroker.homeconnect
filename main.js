"use strict";

const utils = require('@iobroker/adapter-core');
const auth = require(__dirname + "/lib/auth.js");
const EventEmitter = require("events");
const EventSource = require("eventsource");

let adapter;

function startAdapter(options) {
	options = options || {};
	Object.assign(options, {
		name: "homeconnect"
	});
	adapter = new utils.Adapter(options);


	let getTokenInterval;
	let getTokenRefreshInterval;
	let reconnectEventStreamInterval;
	let eventSource;
	let availablePrograms = {};
	let eventSourceList = {};

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
						adapter.log.debug("Accestoken created: " + token);
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

						adapter.setState("dev.access", true);
						auth.getAppliances(token).then(
							appliances => {
								parseHomeappliances(appliances);

							},
							([statusCode, description]) => {
								adapter.log.error("Error getting Aplliances Error: " + statusCode);
								adapter.log.error(description);
							}
						);

						adapter.log.debug("Start Refreshinterval");
						getTokenRefreshInterval = setInterval(getRefreshToken, 21600000);
					},
					statusPost => {
						if (statusPost == "400") {
							let stat = "dev.authUriComplete";

							stateGet(stat).then(
								value => {
									adapter.log.error("Please visit this url:  " + value);
								},
								err => {
									adapter.log.error("FEHLER: " + err);
								}
							);
						} else {
							adapter.log.error("Error GetToken: " + statusPost);
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
		if (eventSourceList[haId]) {
			eventSourceList[haId].close();
			eventSourceList[haId].removeEventListener("STATUS", e => processEvent(e), false);
			eventSourceList[haId].removeEventListener("NOTIFY", e => processEvent(e), false);
			eventSourceList[haId].removeEventListener("EVENT", e => processEvent(e), false);
			eventSourceList[haId].removeEventListener("CONNECTED", e => processEvent(e), false);
			eventSourceList[haId].removeEventListener("DISCONNECTED", e => processEvent(e), false);
		}
		eventSourceList[haId] = new EventSource(baseUrl, header);
		// Error handling
		eventSourceList[haId].onerror = err => {
			adapter.log.error("EventSource error: " + JSON.stringify(err));
			adapter.log.error(err.status + " " + err.message);
			if (err.status !== undefined) {
				adapter.log.error("Error (" + haId + ")", err);
				if (err.status === 401) {
					getRefreshToken();
					// Most likely the token has expired, try to refresh the token
					adapter.log.info("Token abgelaufen");
				} else if (err.status === 429) {
					adapter.log.warn("Too many requests. Adapter sends too many requests per minute.");
				} else {
					adapter.log.error("Error: " + err.status);
					throw new Error(err.status);
				}
			}
		};
		eventSourceList[haId].addEventListener("STATUS", e => processEvent(e), false);
		eventSourceList[haId].addEventListener("NOTIFY", e => processEvent(e), false);
		eventSourceList[haId].addEventListener("EVENT", e => processEvent(e), false);
		eventSourceList[haId].addEventListener("CONNECTED", e => processEvent(e), false);
		eventSourceList[haId].addEventListener("DISCONNECTED", e => processEvent(e), false);
		//this.eventSource.addEventListener('KEEP-ALIVE', () => lastAlive = new Date(), false)


	}

	//Eventstream ==>> Datenpunkt

	let processEvent = msg => {
		/*Auswertung des Eventstreams*/
		try {

			adapter.log.debug("event: " + JSON.stringify(msg))
			let stream = msg
			if (!stream) {
				adapter.log.debug("No Return: " + stream);
				return;
			}
			if (stream.type == "DISCONNECTED") {
				adapter.setState(stream.lastEventId + ".general.connected", false, true);
				return;
			}
			if (stream.type == "CONNECTED") {
				adapter.setState(stream.lastEventId + ".general.connected", true, true);
				return;
			}

			let parseMsg = msg.data;

			let parseMessage = JSON.parse(parseMsg);
			parseMessage.items.forEach(element => {
				let haId = parseMessage.haId
				let folder;
				let key;
				if (stream.type === "EVENT") {
					folder = "events"
					key = element.key.replace(/\./g, '_')

				} else {
					folder = element.uri.split("/").splice(4)
					if (folder[folder.length - 1].indexOf(".") != -1) {
						folder.pop();
					}
					folder = folder.join(".");
					key = element.key.replace(/\./g, '_')
				}
				adapter.log.debug(haId + "." + folder + "." + key + ":" + element.value);
				adapter.setObjectNotExists(haId + "." + folder + "." + key, {
					type: "state",
					common: {
						name: key,
						type: "object",
						role: "indicator",
						write: true,
						read: true,
						unit: element.unit || ""
					},
					native: {}
				});

				adapter.setState(haId + "." + folder + "." + key, element.value, true);

			});


		} catch (error) {
			adapter.log.error("Parsemessage: " + error)
			adapter.log.error("Error Event: " + msg)
		}

	};

	adapter.on("unload", function (callback) {
		try {
			adapter.log.info("cleaned everything up...");
			clearInterval(getTokenRefreshInterval);
			clearInterval(getTokenInterval);
			clearInterval(reconnectEventStreamInterval);
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
			const haId = idArray[2]
			if (id.indexOf(".commands.") !== -1) {
				adapter.log.debug(id);
				if (id.indexOf("StopProgram") && state.val) {
					stateGet(adapter.namespace + ".dev.token").then(token => {
						deleteAPIValues(token, haId, "/programs/active");
					})

				} else {
					const data = {
						data: {
							key: command,
							value: state.val
						}
					}
					stateGet(adapter.namespace + ".dev.token").then(token => {
						putAPIValues(token, haId, "/commands/" + command, data);
					})
				}
			}
			if (id.indexOf(".settings.") !== -1) {
				let data = {
					data: {
						key: command,
						value: state.val,
						type: command
					}
				}
				stateGet(adapter.namespace + ".dev.token").then(token => {
					putAPIValues(token, haId, "/settings/" + command, data);
				})
			}
			if (id.indexOf(".options.") !== -1) {
				let data = {
					data: {
						key: command,
						value: state.val
					}
				}
				const folder = idArray.slice(3, idArray.length).join("/");
				stateGet(adapter.namespace + ".dev.token").then(token => {
					putAPIValues(token, haId, "/" + folder + "/" + command, data);
				})
			}
			if (id.indexOf("BSH_Common_Root_") !== -1) {
				const data = {
					data: {
						key: state.val
					}
				}
				if (id.indexOf("Active") !== -1) {

					stateGet(adapter.namespace + ".dev.token").then(token => {
						putAPIValues(token, haId, "/programs/active", data).then(() => updateOptions(token, haId, "/programs/active"));
					})
				}
				if (id.indexOf("Selected") !== -1) {

					stateGet(adapter.namespace + ".dev.token").then(token => {
						putAPIValues(token, haId, "/programs/selected", data).then(() => updateOptions(token, haId, "/programs/selected"));
					})
				}
			}
		} else {
			const idArray = id.split(".");
			const haId = idArray[2]
			if (id.indexOf("BSH_Common_Root_") !== -1) {
				if (id.indexOf("Active") !== -1) {
					stateGet(adapter.namespace + ".dev.token").then(token => {
						updateOptions(token, haId, "/programs/active");
					})
				}
				if (id.indexOf("Selected") !== -1) {
					stateGet(adapter.namespace + ".dev.token").then(token => {
						updateOptions(token, haId, "/programs/selected");
					})
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

			var allIds = Object.keys(states);
			let searchString = "selected.options."
			if (url.indexOf("/active") !== -1) {
				searchString = "active.options."
			}
			adapter.log.debug(searchString)
			allIds.forEach(function (keyName) {
				if (keyName.indexOf(searchString) !== -1) {
					adapter.delObject(keyName.split(".").slice(2).join("."))

				}
			})
			setTimeout(() => getAPIValues(token, haId, url + "/options"), 0);

		})

		adapter.log.debug("Delete: " + haId + url.replace(/\//g, ".") + ".options")
	}

	function parseHomeappliances(appliancesArray) {
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
			adapter.setObjectNotExists(haId + ".commands.BSH_Common_Command_StopProgram", {
				type: "state",
				common: {
					name: "Stop Program",
					type: "boolean",
					role: "button",
					write: false,
					read: true
				},
				native: {}
			});
			adapter.setObjectNotExists(haId + ".commands.BSH_Common_Command_PauseProgram", {
				type: "state",
				common: {
					name: "Pause Program",
					type: "boolean",
					role: "button",
					write: false,
					read: true
				},
				native: {}
			});
			adapter.setObjectNotExists(haId + ".commands.BSH_Common_Command_ResumeProgram", {
				type: "state",
				common: {
					name: "Resume Program",
					type: "boolean",
					role: "button",
					write: false,
					read: true
				},
				native: {}
			});
			let tokenID = adapter.namespace + ".dev.token";
			stateGet(tokenID).then(value => {
				let token = value;
				getAPIValues(token, haId, '/programs/available');
				getAPIValues(token, haId, "/status");
				getAPIValues(token, haId, '/settings');
				getAPIValues(token, haId, "/programs/active");
				getAPIValues(token, haId, "/programs/selected");

				updateOptions(token, haId, "/programs/active");
				updateOptions(token, haId, "/programs/selected");
				startEventStream(token, haId);
				// reconnectEventStreamInterval = setInterval(() => {
				// 	adapter.log.debug("reconnect EventStream");
				// 	startEventStream(token, haId);
				// }, 12 * 60 * 60 * 1000); //each 12h reconnect eventstream;
			}, err => {
				adapter.log.error("FEHLER: " + err);
			});
		});
	}

	function putAPIValues(token, haId, url, data) {
		return new Promise((resolve, reject) => {
			adapter.log.debug(haId + url)
			adapter.log.debug(JSON.stringify(data))
			auth.sendRequest(token, haId, url, "PUT", JSON.stringify(data)).then(([statusCode, returnValue]) => {
				adapter.log.debug((statusCode + " " + returnValue))
				adapter.log.debug(JSON.stringify(returnValue))
				resolve();
			}, ([statusCode, description]) => {
				if (statusCode === 403) {
					adapter.log.info("Homeconnect API has not the rights for this command and device")
				}
				adapter.log.info(statusCode + ": " + description);
				reject();
			});
		});
	}

	function deleteAPIValues(token, haId, url) {
		auth.sendRequest(token, haId, url, "DELETE").then(([statusCode, returnValue]) => {
			adapter.log.debug(url);
			adapter.log.debug(JSON.stringify(returnValue))
		})
	}

	function getAPIValues(token, haId, url) {
		auth.sendRequest(token, haId, url).then(([statusCode, returnValue]) => {
			adapter.log.debug(url);
			adapter.log.debug(JSON.stringify(returnValue))
			if (url.indexOf('/settings/') !== -1) {
				let common = {
					name: returnValue.data.name,
					type: "string",
					role: "indicator",
					write: true,
					read: true,
					states: {}

				}
				returnValue.data.constraints.allowedvalues.forEach((element, index) => {
					common.states[element] = returnValue.data.constraints.displayvalues[index]

				});
				const folder = ".settings." + returnValue.data.key.replace(/\./g, '_');
				adapter.extendObject(haId + folder, {
					type: "state",
					common: common,
					native: {}
				});
				return;
			}

			if (url.indexOf('/programs/available/') !== -1) {
				if (returnValue.data.options) {
					returnValue.data.options.forEach((option) => {
						let common = {
							name: option.name,
							type: "string",
							role: "indicator",
							unit: option.unit || "",
							write: true,
							read: true,
							min: option.constraints.min || null,
							max: option.constraints.max || null,

						}

						if (option.constraints.allowedvalues) {
							common.states = {}
							option.constraints.allowedvalues.forEach((element, index) => {
								common.states[element] = option.constraints.displayvalues[index]

							});
						}
						const folder = ".programs.available.options." + option.key.replace(/\./g, '_');


						adapter.extendObject(haId + folder, {
							type: "state",
							common: common,
							native: {}
						});
						adapter.setState(haId + folder, option.constraints.default, true);

					})
				}
				return;
			}


			if ("key" in returnValue.data) {
				returnValue.data = {
					items: [returnValue.data]
				};
			}
			for (const item in returnValue.data) {
				returnValue.data[item].forEach(subElement => {
					if (url === '/programs/active') {
						subElement.value = subElement.key
						subElement.key = 'BSH_Common_Root_ActiveProgram'
						subElement.name = 'BSH_Common_Root_ActiveProgram'
					}
					if (url === '/programs/selected') {
						subElement.value = subElement.key
						subElement.key = 'BSH_Common_Root_SelectedProgram'
						subElement.name = 'BSH_Common_Root_SelectedProgram'
					}
					if (url === '/programs/available') {
						adapter.log.debug(haId + " available: " + JSON.stringify(subElement))
						if (availablePrograms[haId]) {
							availablePrograms[haId].push({
								key: subElement.key,
								name: subElement.name
							})
						} else {
							availablePrograms[haId] = [{
								key: subElement.key,
								name: subElement.name
							}]
						}
						getAPIValues(token, haId, '/programs/available/' + subElement.key)
					}
					if (url === '/settings') {
						getAPIValues(token, haId, '/settings/' + subElement.key)
					}
					const folder = url.replace(/\//g, ".");
					adapter.log.debug("Create State: " + haId + folder + "." + subElement.key.replace(/\./g, '_'))
					let common = {
						name: subElement.name,
						type: "object",
						role: "indicator",
						write: true,
						read: true,
						unit: subElement.unit || ""
					}

					adapter.setObjectNotExists(haId + folder + "." + subElement.key.replace(/\./g, '_'), {
						type: "state",
						common: common,
						native: {}
					});
					adapter.setState(haId + folder + "." + subElement.key.replace(/\./g, '_'), subElement.value, true);
				});
			}
			if (url === '/programs/available') {
				const rootItems = [{
					key: "BSH_Common_Root_ActiveProgram",
					folder: '.programs.active'
				}, {
					key: "BSH_Common_Root_SelectedProgram",
					folder: '.programs.selected'
				}]
				rootItems.forEach((rootItem) => {

					let common = {
						name: rootItem.key,
						type: "string",
						role: "indicator",
						write: true,
						read: true,
						states: {}
					}
					availablePrograms[haId].forEach((program) => {
						common.states[program.key] = program.name;
					});
					adapter.setObjectNotExists(haId + rootItem.folder + "." + rootItem.key.replace(/\./g, '_'), {
						type: "state",
						common: common,
						native: {}
					});
					adapter.extendObject(haId + rootItem.folder + "." + rootItem.key.replace(/\./g, '_'), {
						type: "state",
						common: common,
						native: {}
					});
				})
			}
		}, ([statusCode, description]) => {
			// adapter.log.info("Error getting API Values Error: " + statusGet);
			adapter.log.info(haId + ": " + description);
		});
	}

	function main() {
		if (!adapter.config.clientID) {
			adapter.log.error("Client ID not specified!");
		}

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
						adapter.log.error("Error AuthUriGet: " + statusPost);
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
									parseHomeappliances(appliances);
								},
								statusGet => {
									adapter.log.error(
										"Error getting homeapplianceJSON with Token. Please reset Token in settings. " + statusGet
									);
								}
							);
							let stat = adapter.namespace + ".dev.refreshToken";
							stateGet(stat).then(value => {
								let refreshToken = value;
								getTokenRefreshInterval = setInterval(getRefreshToken, 12 * 60 * 60 * 1000); //every 12h 
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



		adapter.subscribeStates("*");

		return adapter;
	}
}
// If started as allInOne/compact mode => return function to create instance
if (module && module.parent) {
	module.exports = startAdapter;
} else {
	// or start the instance directly
	startAdapter();
}