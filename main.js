'use strict';

const utils = require(__dirname + '/lib/utils'); // Get common adapter utils
const auth = require(__dirname + '/lib/auth.js');
const EventEmitter = require('events');
const EventSource = require('eventsource');

const adapter = new utils.Adapter('homeconnect');

const devices = {
    "Oven": [
        {"name": "Setting.PowerState", "type": "mixed", "unit": ""},
        {"name": "Status.CurrentCavityTemperature", "type": "number", "unit": ""},
        {"name": "Status.DoorState", "type": "mixed", "unit": ""},
        {"name": "Status.LocalControlActive", "type": "boolean", "unit": ""},
        {"name": "Status.RemoteControlStartAllowed", "type": "boolean", "unit": ""},
        {"name": "Status.RemoteControlActive", "type": "boolean", "unit": ""},
        {"name": "Status.OperationState", "type": "mixed", "unit": ""},
        {"name": "Option.ProgramProgress", "type": "number", "unit": "%"},
        {"name": "Option.ElapsedProgramTime", "type": "number", "unit": "sec."},
        {"name": "Option.RemainingProgramTime", "type": "number", "unit": "sec."},
        {"name": "Option.SetpointTemperature", "type": "number", "unit": "°C"},
        {"name": "Option.Duration", "type": "number", "unit": "sec."},
        {"name": "Option.StartInRelative", "type": "number", "unit": "sec."},
        {"name": "Option.FastPreHeat", "type": "boolean", "unit": ""},
        {"name": "Root.ActiveProgram", "type": "mixed", "unit": ""},
        {"name": "Root.SelectedProgram", "type": "mixed", "unit": ""},
        {"name": "Event.ProgramFinished", "type": "mixed", "unit": ""},
        {"name": "Event.AlarmClockElapsed", "type": "mixed", "unit": ""},
        {"name": "Event.PreheatFinished", "type": "mixed", "unit": ""},
        {"name": "Event.ProgramAborted", "type": "mixed", "unit": ""}
    ],

    "Dishwasher": [
        {"name": "Setting.PowerState", "type": "mixed", "unit": ""},
        {"name": "Status.DoorState", "type": "mixed", "unit": ""},
        {"name": "Status.OperationState", "type": "mixed", "unit": ""},
        {"name": "Status.RemoteControlStartAllowed", "type": "boolean", "unit": ""},
        {"name": "Status.RemoteControlActive", "type": "boolean", "unit": ""},
        {"name": "Root.ActiveProgram", "type": "mixed", "unit": ""},
        {"name": "Root.SelectedProgram", "type": "mixed", "unit": ""},
        {"name": "Option.StartInRelative", "type": "number", "unit": "sec."},
        {"name": "Option.ProgramProgress", "type": "number", "unit": "%"},
        {"name": "Option.RemainingProgramTime", "type": "number", "unit": "sec."},
        {"name": "Event.ProgramAborted", "type": "mixed", "unit": ""},
        {"name": "Event.ProgramFinished", "type": "mixed", "unit": ""}
    ],

    "CoffeeMaker": [
        {"name": "Status.OperationState", "type": "mixed", "unit": ""},
        {"name": "Status.RemoteControlStartAllowed", "type": "boolean", "unit": ""},
        {"name": "Status.RemoteControlActive", "type": "boolean", "unit": ""},
        {"name": "Root.ActiveProgram", "type": "mixed", "unit": ""},
        {"name": "Root.SelectedProgram", "type": "mixed", "unit": ""},
        {"name": "Option.ProgramProgress", "type": "number", "unit": "%"},
        {"name": "Option.RemainingProgramTime", "type": "number", "unit": "sec."},
        {"name": "Option.BeanAmount", "type": "mixed", "unit": ""},
        {"name": "Option.FillQuantity", "type": "number", "unit": "ml"},
        {"name": "Option.CoffeeTemperature", "type": "mixed", "unit":""},
        {"name": "Setting.PowerState", "type": "mixed", "unit": ""},
        {"name": "Event.BeanContainerEmpty", "type": "mixed", "unit": ""},
        {"name": "Event.WaterTankEmpty", "type": "mixed", "unit": ""}
    ],

    "Washer": [
        {"name": "Root.ActiveProgram", "type": "mixed", "unit": ""},
        {"name": "Root.SelectedProgram", "type": "mixed", "unit": ""},
        {"name": "Option.Temperature", "type": "mixed", "unit": "°C"},
        {"name": "Option.SpinSpeed", "type": "mixed", "unit": ""},
        {"name": "Option.ProgramProgress", "type": "number", "unit": "%"},
        {"name": "Option.RemainingProgramTime", "type": "number", "unit": "sec."},
        {"name": "Setting.PowerState", "type": "mixed", "unit": ""},
        {"name": "Status.RemoteControlStartAllowed", "type": "boolean", "unit": ""},
        {"name": "Status.RemoteControlActive", "type": "boolean", "unit": ""},
        {"name": "Status.LocalControlActive", "type": "boolean", "unit": ""},
        {"name": "Status.DoorState", "type": "mixed", "unit": ""},
        {"name": "Status.OperationState", "type": "mixed", "unit": ""},
        {"name": "Event.ProgramFinished", "type": "mixed", "unit": ""},
        {"name": "Event.ProgramAborted", "type": "mixed", "unit": ""}
    ],

    "Dryer": [
        {"name": "Root.ActiveProgram", "type": "mixed", "unit": ""},
        {"name": "Root.SelectedProgram", "type": "mixed", "unit": ""},
        {"name": "Option.DryingTarget", "type": "mixed", "unit": ""},
        {"name": "Option.ProgramProgress", "type": "number", "unit": "%"},
        {"name": "Option.RemainingProgramTime", "type": "number", "unit": "sec."},
        {"name": "Setting.PowerState", "type": "mixed", "unit": ""},
        {"name": "Status.RemoteControlStartAllowed", "type": "boolean", "unit": ""},
        {"name": "Status.RemoteControlActive", "type": "boolean", "unit": ""},
        {"name": "Status.LocalControlActive", "type": "boolean", "unit": ""},
        {"name": "Status.DoorState", "type": "mixed", "unit": ""},
        {"name": "Status.OperationState", "type": "mixed", "unit": ""},
        {"name": "Event.ProgramFinished", "type": "mixed", "unit": ""},
        {"name": "Event.ProgramAborted", "type": "mixed", "unit": ""}
    ],

    "WasherDryer": [
        {"name": "Root.ActiveProgram", "type": "mixed", "unit": ""},
        {"name": "Root.SelectedProgram", "type": "mixed", "unit": ""},
        {"name": "Option.Temperature", "type": "mixed", "unit": "°C"},
        {"name": "Option.SpinSpeed", "type": "mixed", "unit": ""},
        {"name": "Option.DryingTarget", "type": "mixed", "unit": ""},
        {"name": "Option.ProgramProgress", "type": "number", "unit": "%"},
        {"name": "Option.RemainingProgramTime", "type": "number", "unit": "sec."},
        {"name": "Setting.PowerState", "type": "mixed", "unit": ""},
        {"name": "Status.RemoteControlStartAllowed", "type": "boolean", "unit": ""},
        {"name": "Status.RemoteControlActive", "type": "boolean", "unit": ""},
        {"name": "Status.LocalControlActive", "type": "boolean", "unit": ""},
        {"name": "Status.DoorState", "type": "mixed", "unit": ""},
        {"name": "Status.OperationState", "type": "mixed", "unit": ""},
        {"name": "Event.ProgramFinished", "type": "mixed", "unit": ""},
        {"name": "Event.ProgramAborted", "type": "mixed", "unit": ""}
    ],

    "FridgeFreezer": [
        {"name": "Setting.PowerState", "type": "mixed", "unit": ""},
        {"name": "Setting.SetpointTemperatureFreezer", "type": "number", "unit": "°C"},
        {"name": "Setting.SetpointTemperatureRefrigerator", "type": "number", "unit": "°C"},
        {"name": "Setting.SuperModeFreezer", "type": "boolean", "unit": ""},
        {"name": "Setting.SuperModeRefrigerator", "type": "boolean", "unit": ""},
        {"name": "Status.DoorState", "type": "mixed", "unit": ""},
        {"name": "Event.DoorAlarmFreezer", "type": "mixed", "unit": ""},
        {"name": "Event.DoorAlarmRefrigerator", "type": "mixed", "unit": ""},
        {"name": "Event.TemperatureAlarmFreezer", "type": "mixed", "unit": ""}
    ],

    "Hob": [
        {"name": "Root.ActiveProgram", "type": "mixed", "unit": ""},
        {"name": "Root.SelectedProgram", "type": "mixed", "unit": ""},
        {"name": "Setting.PowerState", "type": "mixed", "unit": ""},
        {"name": "Status.RemoteControlActive", "type": "boolean", "unit": ""},
        {"name": "Status.LocalControlActive", "type": "boolean", "unit": ""},
        {"name": "Status.OperationState", "type": "mixed", "unit": ""},
        {"name": "Event.ProgramFinished", "type": "mixed", "unit": ""},
        {"name": "Event.AlarmClockElapsed", "type": "mixed", "unit": ""},
        {"name": "Event.PreheatFinished", "type": "mixed", "unit": ""}
    ],

    "Hood": [
        {"name": "Root.ActiveProgram", "type": "mixed", "unit": ""},
        {"name": "Option.Duration", "type": "number", "unit": "sec."},
        {"name": "Option.Hood.VentingLevel", "type": "mixed", "unit": ""},
        {"name": "Option.Hood.IntensiveLevel", "type": "mixed", "unit": ""},
        {"name": "Option.ProgramProgress", "type": "number", "unit": "%"},
        {"name": "Option.ElapsedProgramTime", "type": "number", "unit": "sec."},
        {"name": "Option.RemainingProgramTime", "type": "number", "unit": "sec."},
        {"name": "Setting.PowerState", "type": "mixed", "unit": ""},
        {"name": "Status.RemoteControlStartAllowed", "type": "boolean", "unit": ""},
        {"name": "Status.RemoteControlActive", "type": "boolean", "unit": ""},
        {"name": "Status.LocalControlActive", "type": "boolean", "unit": ""},
        {"name": "Status.OperationState", "type": "mixed", "unit": ""},
        {"name": "Event.ProgramFinished", "type": "mixed", "unit": ""}
    ]
};

let getTokenInterval;

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

function getToken() {

    let stat = 'dev.devCode';

    stateGet(stat).then(
            (value) => {
                let clientID = adapter.config.clientID;
                let deviceCode = value;
                auth.tokenGet(deviceCode, clientID).then(
                        ([token, refreshToken, expires, tokenScope]) => {
                            adapter.log.info('Accestoken generiert!');
                            adapter.setState('dev.token', {val: token, ack: true});
                            adapter.setState('dev.refreshToken', {val: refreshToken, ack: true});
                            adapter.setState('dev.expires', {val: expires, ack: true});
                            adapter.setState('dev.tokenScope', {val: tokenScope, ack: true});
                            clearInterval(getTokenInterval);

                            getTokenRefreshInterval = setInterval(getRefreshToken, 3600000);

                            function getRefreshToken() {
                                auth.tokenRefresh(refreshToken).then(
                                        ([token, refreshToken, expires, tokenScope]) => {
                                            adapter.log.info('Accestoken erneuert...');
                                            adapter.setState('dev.token', {val: token, ack: true});
                                            adapter.setState('dev.refreshToken', {val: refreshToken, ack: true});
                                            adapter.setState('dev.expires', {val: expires, ack: true});
                                            adapter.setState('dev.tokenScope', {val: tokenScope, ack: true});
                                        },
                                        statusPost => {
                                            if (statusPost == '400') {
                                                adapter.log.error('FEHLER beim Refresh-Token!');
                                            } else {
                                                adapter.log.error("Irgendwas stimmt da wohl nicht!! Refresh-Token!!    Fehlercode: " + statusPost);
                                            }
                                        }
                                )
                            }
                        },
                        statusPost => {
                            if (statusPost == '400') {
                                let stat = 'dev.authUriComplete';

                                stateGet(stat).then(
                                        (value) => {
                                            adapter.log.error('Bitte ioBroker authorisieren!!  =====>>>   ' + value);
                                        },
                                        err => {
                                            adapter.log.error('FEHLER: ' + err);
                                        }
                                );
                            } else {
                                adapter.log.error("Irgendwas stimmt da wohl nicht!! Token!!    Fehlercode: " + statusPost);
                                clearInterval(getTokenInterval);
                            }
                        });
            },
            err => {
                adapter.log.error('getToken FEHLER: ' + err);
                clearInterval(getTokenInterval);
            }
    )
}

/* Eventstream
*/
function receive(token, haId) {

    let openStream = () => {
        let baseUrl = "https://api.home-connect.com/api/homeappliances/" + haId + "/events";
        let header = {headers: {Authorization: 'Bearer ' + token, Accept: 'text/event-stream'}}
        adapter.log.debug(header.headers.Authorization);
        let eventSource = new EventSource(baseUrl, header);
        adapter.log.debug('vor Errorhandling');
        // Error handling
        eventSource.onerror = (err => {
            adapter.log.error(err.status);
            if (err.status !== undefined) {
                adapter.log.error('Error (' + haId + ')', err);
                if (err.status === 401) {

                    // Most likely the token has expired, try to refresh the token
                    adapter.log.error("Token abgelaufen");

                } else {
                    adapter.log.error('FEHLER');
                    throw(new Error(err.status))
                }
            }
        });
        adapter.log.debug('Add Eventlistener');
        eventSource.addEventListener('STATUS', (e) => processEvent(e), false)
        eventSource.addEventListener('NOTIFY', (e) => processEvent(e), false)
        eventSource.addEventListener('EVENT', (e) => processEvent(e), false)
        eventSource.addEventListener('CONNECTED', (e) => processEvent(e), false)
        eventSource.addEventListener('DISCONNECTED', (e) => processEvent(e), false)
        //this.eventSource.addEventListener('KEEP-ALIVE', () => lastAlive = new Date(), false)
    };

    // Open the event stream

    openStream();


}

//Eventstream ==>> Datenpunkt

let processEvent = (msg) => {

    adapter.setState(adapter.namespace + '.dev.eventStreamJSON', JSON.stringify(msg));


};


//////////////////////////////////////////////////////////////////////////////////////////////////////


adapter.on('unload', function (callback) {
    try {
        adapter.log.info('cleaned everything up...');
        clearInterval(getTokenRefreshInterval);
        clearInterval(getTokenInterval);
        callback();
    } catch (e) {
        callback();
    }
});

adapter.on('objectChange', function (id, obj) {
    adapter.log.info('objectChange ' + id + ' ' + JSON.stringify(obj));
});

adapter.on('stateChange', function (id, state) {

    //adapter.log.info('stateChange ' + id + ' ' + JSON.stringify(state));

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////    

    if (id == adapter.namespace + '.dev.eventStreamJSON') {

        /*Auswertung des Eventstreams*/

        let streamArray = state.val;
        let stream = JSON.parse(streamArray);
        let parseMsg = stream.data;
        let parseMessage = JSON.parse(parseMsg);


        if (stream.type == 'DISCONNECTED') {
            adapter.log.debug('DISCONNECTED');
           
        }


        if (stream.type == 'NOTIFY') {
            adapter.log.debug('NOTIFY');

            notify();
        }


        if (stream.type == 'EVENT' || stream.type == 'STATUS') {

            let haId = stream.lastEventId;
            let dpKey = parseMessage.items[0].key;
            let string2 = dpKey.split('.');
            let dp2 = string2.slice(3, 4);
            let dp1 = string2.slice(2, 3);
            let dp = dp1 + "." + dp2;
            let valueVal = parseMessage.items[0].value;

            adapter.log.debug("Datenpunkt: " + dp + "   Value: " + valueVal);

            eventSetDp(valueVal, dp, haId);

        }


        function notify() {
            let notifyCounterArray = parseMessage.items.length;
            let notifyCounter = 0;
            notifyLoop();

            function notifyLoop() {
                adapter.log.debug('notifyCounter ===>>>  ' + notifyCounter);
                if (notifyCounter != notifyCounterArray) {
                    let haId = stream.lastEventId;
                    let dpKey = parseMessage.items[notifyCounter].key;
                    let string2 = dpKey.split('.');
                    let dp2 = string2.slice(3, 4);
                    let dp1 = string2.slice(2, 3);
                    let dp = dp1 + "." + dp2;
                    let valueVal = parseMessage.items[notifyCounter].value;

                    adapter.log.debug("Datenpunkt: " + dp + "   Value: " + valueVal);

                    notifySetDp(valueVal, dp, haId);

                    notifyCounter++;
                    notifyLoop();
                }

            }

        }


        function eventSetDp(valueVal, dp, haId) {
            if (typeof valueVal != 'boolean') {

                let string3 = valueVal.split('.');
                let value = string3.splice(4, 5);
                adapter.setState(haId + '.' + dp, {val: value, ack: true});
                
                adapter.log.debug("Datenpunkt: " + haId + '.' + dp + '    Value: ' + value);
            } else {
                let value = valueVal;
                adapter.setState(haId + '.' + dp, {val: value, ack: true});
                
                adapter.log.debug("Datenpunkt: " + haId + '.' + dp + '    Value: ' + value);
            }
        }


        function notifySetDp(valueVal, dp, haId) {
            if (typeof valueVal == 'string') {
                    adapter.log.debug("Type: " + typeof valueVal);                  // Logging zu Issue TypeError: valueVal.split is not a function
                    adapter.log.debug("valueVal: " + valueVal);
                    let string3 = valueVal.split('.');
                let value = string3.splice(4, 5);
                adapter.setState(haId + '.' + dp, {val: value, ack: true});
                

            } else if (typeof valueVal == 'number' || typeof valueVal == 'boolean') {
                let value = valueVal;
                adapter.setState(haId + '.' + dp, {val: value, ack: true});
                

            } 

        }


    }


///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    if (id == adapter.namespace + '.dev.homeappliancesJSON') {
        let appliances = state.val;
        let appliancesArray = JSON.parse(appliances);
        let appliancesLength = appliancesArray.data.homeappliances.length;
        let appliancesCount = 0;

        inventory(appliancesLength);

        function inventory(appliancesLength) {

            inventorySub();

            function inventorySub() {

                if (appliancesCount < appliancesLength) {

                    let name = adapter.namespace + '.' + appliancesArray.data.homeappliances[appliancesCount].name;
                    let brand = appliancesArray.data.homeappliances[appliancesCount].brand;
                    let vib = appliancesArray.data.homeappliances[appliancesCount].vib;
                    let connected = appliancesArray.data.homeappliances[appliancesCount].connected;
                    let type = appliancesArray.data.homeappliances[appliancesCount].type;
                    let enumber = appliancesArray.data.homeappliances[appliancesCount].enumber;
                    let haId = appliancesArray.data.homeappliances[appliancesCount].haId;

                    adapter.setObjectNotExists(haId + '.General.currentStatusJSON', {
                        type: 'state',
                        common: {
                            name: 'currentStatusJSON',
                            type: 'object',
                            role: 'indicator',
                            write: false,
                            read: true
                        },
                        native: {}
                    });

                    adapter.setObjectNotExists(haId + '.General.programsAvailableJSON', {
                        type: 'state',
                        common: {
                            name: 'programsAvailableJSON',
                            type: 'object',
                            role: 'indicator',
                            write: false,
                            read: true
                        },
                        native: {}
                    });

                    adapter.setObjectNotExists(haId + '.General.settingsAvailableJSON', {
                        type: 'state',
                        common: {
                            name: 'settingsAvailableJSON',
                            type: 'object',
                            role: 'indicator',
                            write: false,
                            read: true
                        },
                        native: {}
                    });

                    adapter.setObjectNotExists(haId, {
                        type: 'state',
                        common: {
                            name: 'haId',
                            type: 'mixed',
                            role: 'indicator',
                            write: false,
                            read: true
                        },
                        native: {}
                    });

                    adapter.setObjectNotExists(haId + '.General.brand', {
                        type: 'state',
                        common: {
                            name: 'brand',
                            type: 'mixed',
                            role: 'indicator',
                            write: false,
                            read: true
                        },
                        native: {}
                    });

                    adapter.setObjectNotExists(haId + '.General.vib', {
                        type: 'state',
                        common: {
                            name: 'vib',
                            type: 'mixed',
                            role: 'indicator',
                            write: false,
                            read: true
                        },
                        native: {}
                    });

                    adapter.setObjectNotExists(haId + '.General.connected', {
                        type: 'state',
                        common: {
                            name: 'connected',
                            type: 'boolean',
                            role: 'indicator',
                            write: false,
                            read: true
                        },
                        native: {}
                    });

                    adapter.setObjectNotExists(haId + '.General.type', {
                        type: 'state',
                        common: {
                            name: 'type',
                            type: 'mixed',
                            role: 'indicator',
                            write: false,
                            read: true
                        },
                        native: {}
                    });

                    adapter.setObjectNotExists(haId + '.General.enumber', {
                        type: 'state',
                        common: {
                            name: 'enumber',
                            type: 'mixed',
                            role: 'indicator',
                            write: false,
                            read: true
                        },
                        native: {}
                    });

                    adapter.setObjectNotExists(haId + '.General.haId', {
                        type: 'state',
                        common: {
                            name: 'haId',
                            type: 'mixed',
                            role: 'indicator',
                            write: false,
                            read: true
                        },
                        native: {}
                    });


                    /*///////////////////////////////// verfügbare Datenpunkte ///////////////////////////////////

                    aktuellen Status abfragen und Datenpunkte anlegen und States setzen

                    */


                    switch (type) {
                        case "Oven":
                            adapter.log.debug('Type= ' + type);
                            devicesDp(devices.Oven);
                            break;

                        case "Washer":
                            adapter.log.debug('Type= ' + type);
                            devicesDp(devices.Washer);
                            break;

                        case "Dishwasher":
                            adapter.log.debug('Type= ' + type);
                            devicesDp(devices.Dishwasher);
                            break;

                        case "Dryer":
                            adapter.log.debug('Type= ' + type);
                            devicesDp(devices.Dryer);
                            break;

                        case "WasherDryer":
                            adapter.log.debug('Type= ' + type);
                            devicesDp(devices.WasherDryer);
                            break;

                        case "FridgeFreezer":
                            adapter.log.debug('Type= ' + type);
                            devicesDp(devices.FridgeFreezer);
                            break;

                        case "Hob":
                            adapter.log.debug('Type= ' + type);
                            devicesDp(devices.Hob);
                            break;

                        case "Hood":
                            adapter.log.debug('Type= ' + type);
                            devicesDp(devices.Hood);
                            break;

                        case "CoffeeMaker":
                            adapter.log.debug('Type= ' + type);
                            devicesDp(devices.CoffeeMaker);
                            break;

                    }


                    function devicesDp(deviceDp) {

                        let deviceDpLength = deviceDp.length;
                        let deviceDpCounter = 0;

                        devicesDpLoop();

                        function devicesDpLoop() {

                            if (deviceDpCounter != deviceDpLength) {
                                let dp = adapter.namespace + '.' + haId + '.' + deviceDp[deviceDpCounter].name;
                                adapter.log.debug(' Datenpunkt : ' + dp);
                                adapter.setObjectNotExists(dp, {
                                    type: 'state',
                                    common: {
                                        name: deviceDp[deviceDpCounter].name,
                                        type: deviceDp[deviceDpCounter].type,
                                        role: 'indicator',
                                        unit: deviceDp[deviceDpCounter].unit,
                                        write: false,
                                        read: true
                                    },
                                    native: {}
                                });

                                deviceDpCounter++;
                                devicesDpLoop();
                            }
                        }
                    }


/////////////////////////////////////////////////////////////////////////////////////////////*/

                    setTimeout(function () {
                        appliancesStates()
                    }, 3000);

                    function appliancesStates() {
                        adapter.setState(haId + '.General.brand', brand);
                        adapter.setState(haId + '.General.vib', vib);
                        adapter.setState(haId + '.General.connected', connected);
                        adapter.setState(haId + '.General.type', type);
                        adapter.setState(haId + '.General.enumber', enumber);
                        adapter.setState(haId + '.General.haId', haId);
                    }

                    appliancesCount++;
                    ///////
                    let stat2 = adapter.namespace + '.dev.token';
                    stateGet(stat2).then(
                            (value) => {
                                let token = value;

                                receive(token, haId);

                            },
                            err => {
                                adapter.log.error('FEHLER: ' + err);
                            }
                    );

/////////                    
                    inventorySub();
                }
            }
        }
    }

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

    if (id == adapter.namespace + '.dev.token') {
        let token = state.val;
        adapter.setState('dev.access', true);

        auth.getAppliances(token).then(
                (appliances) => {
                    adapter.setState(adapter.namespace + '.dev.homeappliancesJSON', JSON.stringify(appliances));
                },
                ([statusGet, description]) => {
                    if (statusGet == '400') {
                        adapter.log.error('XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX');
                    } else {
                        adapter.log.error("1: Irgendwas stimmt da wohl nicht!!     Fehlercode: " + statusGet);
                        adapter.log.error(description);
                    }
                }
        )
    }

    if (id == adapter.namespace + '.dev.devCode') {
        getTokenInterval = setInterval(getToken, 10000);          // Polling bis Authorisation erfolgt ist
    }

    // you can use the ack flag to detect if it is status (true) or command (false)
    if (state && !state.ack) {
        //adapter.log.info('ack is not set!');
    }
});

// Some message was sent to adapter instance over message box. Used by email, pushover, text2speech, ...
adapter.on('message', function (obj) {
    if (typeof obj === 'object' && obj.message) {
        if (obj.command === 'send') {
            // e.g. send email or pushover or whatever
            console.log('send command');

            // Send response in callback if required
            if (obj.callback) adapter.sendTo(obj.from, obj.command, 'Message received', obj.callback);
        }
    }
});


adapter.on('ready', function () {
    main();
});

function main() {

    if (!adapter.config.clientID) {
        adapter.log.error('Client ID not specified!');
    }

//OAuth2 Deviceflow
//Get Authorization-URI to grant access ===> User interaction    

    let scope = adapter.config.scope;
    let clientID = adapter.config.clientID;
    let stat = adapter.namespace + '.dev.access';

    stateGet(stat).then(
            (value) => {
                if (value == false) {

                    auth.authUriGet(scope, clientID).then(
                            ([authUri, devCode, pollInterval]) => {
                                adapter.setState('dev.authUriComplete', authUri);
                                adapter.setState('dev.devCode', devCode);
                                adapter.setState('dev.pollInterval', pollInterval);
                            },
                            statusPost => {
                                if (statusPost == '400') {
                                    adapter.log.error('400 Bad Request (invalid or missing request parameters)');
                                } else {
                                    adapter.log.error("Irgendwas stimmt da wohl nicht!!    Fehlercode: " + statusPost);
                                }
                            }
                    );
                } else if (value == true) {
                    let stat = adapter.namespace + '.dev.token';
                    stateGet(stat).then(
                            (value) => {
                                let token = value;
                                auth.getAppliances(token).then(
                                        (appliances) => {
                                            adapter.setState(adapter.namespace + '.dev.homeappliancesJSON', JSON.stringify(appliances));
                                        },
                                        (statusGet) => {
                                            if (statusGet == '400') {
                                                adapter.log.error('XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX');
                                            } else {
                                                adapter.log.error("Irgendwas stimmt da wohl nicht!! Token!!    Fehlercode: " + statusGet);
                                            }
                                        }
                                )
                            },
                            err => {
                                adapter.log.error('FEHLER: ' + err);
                            }
                    )
                }
            },
            err => {
                adapter.log.error('FEHLER: ' + err);
            }
    );

    adapter.setObjectNotExists('dev.authUriComplete', {
        type: 'state',
        common: {
            name: 'AuthorizationURI',
            type: 'mixed',
            role: 'indicator',
            write: false,
            read: true
        },
        native: {}
    });

    adapter.setObjectNotExists('dev.devCode', {
        type: 'state',
        common: {
            name: 'DeviceCode',
            type: 'mixed',
            role: 'indicator',
            write: false,
            read: true
        },
        native: {}
    });

    adapter.setObjectNotExists('dev.pollInterval', {
        type: 'state',
        common: {
            name: 'Poll-Interval in sec.',
            type: 'mixed',
            role: 'indicator',
            write: false,
            read: true
        },
        native: {}
    });

    adapter.setObjectNotExists('dev.token', {
        type: 'state',
        common: {
            name: 'Access-Token',
            type: 'mixed',
            role: 'indicator',
            write: false,
            read: true
        },
        native: {}
    });

    adapter.setObjectNotExists('dev.refreshToken', {
        type: 'state',
        common: {
            name: 'Refresh-Token',
            type: 'mixed',
            role: 'indicator',
            write: false,
            read: true
        },
        native: {}
    });

    adapter.setObjectNotExists('dev.access', {
        type: 'state',
        common: {
            name: 'access',
            type: 'boolean',
            role: 'indicator',
            write: true,
            read: true
        },
        native: {}
    });

    adapter.setObjectNotExists('dev.homeappliancesJSON', {
        type: 'state',
        common: {
            name: 'Homeappliances_JSON',
            type: 'object',
            role: 'indicator',
            write: false,
            read: true
        },
        native: {}
    });

    adapter.setObjectNotExists('dev.expires', {
        type: 'state',
        common: {
            name: 'Token expires in sec',
            type: 'number',
            role: 'indicator',
            write: false,
            read: true
        },
        native: {}
    });

    adapter.setObjectNotExists('dev.tokenScope', {
        type: 'state',
        common: {
            name: 'Scope',
            type: 'mixed',
            role: 'indicator',
            write: false,
            read: true
        },
        native: {}
    });

    adapter.setObjectNotExists('dev.eventStreamJSON', {
        type: 'state',
        common: {
            name: 'Eventstream_JSON',
            type: 'object',
            role: 'indicator',
            write: false,
            read: true
        },
        native: {}
    });

    //settingsAvailableJSON

    adapter.subscribeStates('*');

}