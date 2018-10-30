/**
 *
 * homeconnect adapter
 *
 *
 */

'use strict';

// you have to require the utils module and call adapter function
const utils =    require(__dirname + '/lib/utils'); // Get common adapter utils
const BSHapi =   require(__dirname + '/lib/BSHapi.json');
const auth =     require(__dirname + '/lib/auth.js');

// you have to call the adapter function and pass a options object
// name has to be set and has to be equal to adapters folder name and main file name excluding extension
// adapter will be restarted automatically every time as the configuration changed, e.g system.adapter.homeconnect.0
const adapter = new utils.Adapter('homeconnect');


// is called when adapter shuts down - callback has to be called under any circumstances!
adapter.on('unload', function (callback) {
    try {
        adapter.log.info('cleaned everything up...');
        callback();
    } catch (e) {
        callback();
    }
});

// is called if a subscribed object changes
adapter.on('objectChange', function (id, obj) {
    // Warning, obj can be null if it was deleted
    adapter.log.info('objectChange ' + id + ' ' + JSON.stringify(obj));
});

// is called if a subscribed state changes
adapter.on('stateChange', function (id, state) {
    // Warning, state can be null if it was deleted
    adapter.log.info('stateChange ' + id + ' ' + JSON.stringify(state));

       
    if (id=='homeconnect.0.devCode'){
        adapter.log.info('Devicecode wurde geändert!');
        let deviceCode=state.val;
        let clientID=adapter.config.clientID;
              
         

        adapter.log.error('DeviceCode vor Token: ' + deviceCode);

        //counter=50;
        let getInterval=setInterval(getToken,5000);
//
function getToken(){

    auth.tokenGet(deviceCode,clientID).then(
        (token)=>{
            adapter.log.info('Accestoken: ' + token);
            adapter.setState('toke', token);    
            clearInterval(getInterval);
        },
        statusPost=>{
            if (statusPost=='400'){
                adapter.log.error('Bitte die Freigabe für ioBroker erteilen!!!');
            }else{
            adapter.log.error("Irgendwas stimmt da wohl nicht!! Token!!    Fehlercode: " + statusPost );
        }
        }
    );        
    }
    //
    }


    // you can use the ack flag to detect if it is status (true) or command (false)
    if (state && !state.ack) {
        adapter.log.info('ack is not set!');
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

// is called when databases are connected and adapter received configuration.
// start here!
adapter.on('ready', function () {
    main();
});

function main() {

    // The adapters config (in the instance object everything under the attribute "native") is accessible via
    // adapter.config:
    adapter.log.info('config ClientID: ' + adapter.config.clientID);

    if (!adapter.config.clientID) {
        adapter.log.error('Client ID not specified!');
        //return;
    }

//OAuth2 Deviceflow
//Get Authorization-URI to grant access ===> User interaction    
	
let scope=adapter.config.scope;
let clientID=adapter.config.clientID;


auth.authUriGet(scope,clientID).then(
    ([authUri,devCode,pollInterval])=>{
        adapter.log.info("Authorization-URI: " + authUri);
        adapter.setState('authUriComplete', authUri);
        adapter.log.info('DeviceCode: ' + devCode);  
        adapter.setState('devCode', devCode);
        adapter.log.info('Poll-Interval: ' + pollInterval + ' sec.');
        adapter.setState('pollInterval', pollInterval);
    },
    statusPost=>{
        if (statusPost=='400'){
            adapter.log.error('400 Bad Request (invalid or missing request parameters)');
        }else{
        adapter.log.error("Irgendwas stimmt da wohl nicht!!    Fehlercode: " + statusPost );
    }
    }
)

/**
let getToken=auth.tokenGet(deviceCode,clientID).then(
    (token)=>{
        adapter.log.info('Accestoken: ' + token);
        if (!token){
            clearInterval(getToken);
        }                
    },
    statusPost=>{
        if (statusPost=='400'){
            adapter.log.error('400 Bad Request (invalid or missing request parameters)');
        }else{
        adapter.log.error("Irgendwas stimmt da wohl nicht!!    Fehlercode: " + statusPost );
    }
    }
)

 */

    /**
     *
     *      For every state in the system there has to be also an object of type state
     *
     *      Here a simple homeconnect for a boolean variable named "testVariable"
     *
     *      Because every adapter instance uses its own unique namespace variable names can't collide with other adapters variables
     *
     */

    adapter.setObject('authUriComplete', {
        type: 'state',
        common: {
            name: 'AuthorizationURI',
            type: 'mixed',
            role: 'indicator'
        },
        native: {}
    });

    adapter.setObject('devCode', {
        type: 'state',
        common: {
            name: 'DeviceCode',
            type: 'mixed',
            role: 'indicator'
        },
        native: {}
    });

    adapter.setObject('pollInterval', {
        type: 'state',
        common: {
            name: 'Poll-Interval in sec.',
            type: 'mixed',
            role: 'indicator'
        },
        native: {}
    });

    adapter.setObject('token', {
        type: 'state',
        common: {
            name: 'Access-Token',
            type: 'mixed',
            role: 'indicator'
        },
        native: {}
    });

    // in this homeconnect all states changes inside the adapters namespace are subscribed
    adapter.subscribeStates('*');


    /**
     *   setState examples
     *
     *   you will notice that each setState will cause the stateChange event to fire (because of above subscribeStates cmd)
     *
     */

    // the variable testVariable is set to true as command (ack=false)
    //adapter.setState('testVariable', authUri);

    // same thing, but the value is flagged "ack"
    // ack should be always set to true if the value is received from or acknowledged from the target system
    //adapter.setState('testVariable', {val: true, ack: true});

    // same thing, but the state is deleted after 30s (getState will return null afterwards)
    //adapter.setState('testVariable', {val: true, ack: true, expire: 30});



    // examples for the checkPassword/checkGroup functions
    adapter.checkPassword('admin', 'iobroker', function (res) {
        console.log('check user admin pw ioboker: ' + res);
    });

    adapter.checkGroup('admin', 'admin', function (res) {
        console.log('check group user admin group admin: ' + res);
    });



}
