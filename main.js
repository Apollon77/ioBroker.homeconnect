
'use strict';

const utils =    require(__dirname + '/lib/utils'); // Get common adapter utils
const BSHapi =   require(__dirname + '/lib/BSHapi.json');
const auth =     require(__dirname + '/lib/auth.js');

const adapter = new utils.Adapter('homeconnect');


function stateGet(stat){

    return new Promise((resolve, reject) => {
    
    adapter.getState(stat, function (err, state) {
    
        if (err){
            reject(err);
        }else{
            if (typeof state != undefined && state != null){
            let value=state.val;
            resolve(value);
            }else{
                let value=false;
                resolve(value);
            }
        }
    }); 
    });
    }

    function getToken(){
        
        let stat='devicecode';
        let deviceCode=stateGet(stat).then(
            (value)=>{
                adapter.log.info('STATE: ' + value);
                return(deviceCode);
                     },
            err=>{
                adapter.log.error('FEHLER: ' + err);
            }
        )
               
        let clientID=adapter.config.clientID;

        auth.tokenGet(deviceCode,clientID).then(
            ([token,refreshToken])=>{
                adapter.log.info('Accestoken: ' + token);
                adapter.log.info('Refresh-Token: ' + refreshToken);
                adapter.setState('token', {val: token, ack: true});
                adapter.setState('refreshToken', {val: refreshToken, ack: true});
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



adapter.on('unload', function (callback) {
    try {
        adapter.log.info('cleaned everything up...');
        callback();
    } catch (e) {
        callback();
    }
});


adapter.on('objectChange', function (id, obj) {
    adapter.log.info('objectChange ' + id + ' ' + JSON.stringify(obj));
});


adapter.on('stateChange', function (id, state) {

    if (id=='homeconnect.0.token'){
        adapter.log.info('Token wurde geändert!');
        let token=state.val;

        adapter.setState('access', true);

        auth.getAppliances(token).then(
            (appliances)=>{
                adapter.log.error(appliances.data.homeappliances[0].name);
            },
            statusGet=>{
                if (statusGet=='400'){
                    adapter.log.error('Bitte die Freigabe für ioBroker erteilen!!!');
                }else{
                adapter.log.error("Irgendwas stimmt da wohl nicht!! Token!!    Fehlercode: " + statusGet );
            }
            }

        )   
    }
    
    if (id=='homeconnect.0.devCode'){
        adapter.log.info('Devicecode wurde geändert!');
        let deviceCode=state.val;
        let clientID=adapter.config.clientID;
        adapter.log.error('DeviceCode vor Token: ' + deviceCode);

        let getInterval=setInterval(getToken,5000);
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


adapter.on('ready', function () {
    main();
});

function main() {

    if (!adapter.config.clientID) {
        adapter.log.error('Client ID not specified!');
        }

//OAuth2 Deviceflow
//Get Authorization-URI to grant access ===> User interaction    
	
let scope=adapter.config.scope;
let clientID=adapter.config.clientID;
let stat=adapter.namespace + '.access';

stateGet(stat).then(
    (value)=>{
        adapter.log.info('STATE: ' + value);
            if (value === false){

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
            );
            }else if (value === true){
                adapter.log.error('Devicecode: '+ deviceCode);
                getToken();
            }
    },
    err=>{
        
            adapter.log.error('FEHLER: ' + err);
        

    }
)

    
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

    adapter.setObject('refreshToken', {
        type: 'state',
        common: {
            name: 'Refresh-Token',
            type: 'mixed',
            role: 'indicator'
        },
        native: {}
    });

    adapter.setObject('access',  {
        type: 'state',
        common: {
            name: 'access',
            type: 'boolean',
            role: 'indicator',
        },
        native: {}
    });


    adapter.subscribeStates('*');

    adapter.checkPassword('admin', 'iobroker', function (res) {
        console.log('check user admin pw ioboker: ' + res);
    });

    adapter.checkGroup('admin', 'admin', function (res) {
        console.log('check group user admin group admin: ' + res);
    });
}