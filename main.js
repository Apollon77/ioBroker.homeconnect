
'use strict';

const utils =    require(__dirname + '/lib/utils'); // Get common adapter utils
const BSHapi =   require(__dirname + '/lib/BSHapi.json');
const auth =     require(__dirname + '/lib/auth.js');

const adapter = new utils.Adapter('homeconnect');
let getTokenInterval;

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
        
        let stat='dev.devCode';
        
        stateGet(stat).then(
            (value)=>{
                let clientID=adapter.config.clientID;
                let deviceCode=value;
                adapter.log.error('devicecode: '+ deviceCode);                    
        auth.tokenGet(deviceCode,clientID).then(
            ([token,refreshToken,expires])=>{
                adapter.log.info('Accestoken generiert!');
                adapter.setState('dev.token', {val: token, ack: true});
                adapter.setState('dev.refreshToken', {val: refreshToken, ack: true});
                adapter.setState('dev.expires', {val: expires, ack: true});
                clearInterval(getTokenInterval);

                setTimeout(function(){
                auth.tokenRefresh(refreshToken).then(
                    ([token,refreshToken,expires])=>{
                        adapter.log.info('Accestoken generiert! (Refreshtoken)');
                        adapter.setState('dev.token', {val: token, ack: true});
                        adapter.setState('dev.refreshToken', {val: refreshToken, ack: true});
                        adapter.setState('dev.expires', {val: expires, ack: true}); 
                    },
                    statusPost=>{
                        if (statusPost=='400'){
                            adapter.log.error('FEHLER beim Refresh-Token!');
                        }else{
                        adapter.log.error("Irgendwas stimmt da wohl nicht!! Refresh-Token!!    Fehlercode: " + statusPost );
                    }
                    }
                )
            },30000
            );                        
            },
            statusPost=>{
                if (statusPost=='400'){
                    adapter.log.error('Bitte ioBroker authorisieren!!');
                }else{
                adapter.log.error("Irgendwas stimmt da wohl nicht!! Token!!    Fehlercode: " + statusPost );
                clearInterval(getTokenInterval);
            }
            
        });
    },
            err=>{
                adapter.log.error('getToken FEHLER: ' + err);
                clearInterval(getTokenInterval);
            }
        )
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

    adapter.log.info('stateChange ' + id + ' ' + JSON.stringify(state));

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////    

    if (id==adapter.namespace + '.dev.homeappliancesJSON'){
        let appliances=state.val;
        let appliancesArray=JSON.parse(appliances);
        let appliancesLength=appliancesArray.data.homeappliances.length;
        
        let appliancesCount=0;
        
        inventory(appliancesLength);

        function inventory(appliancesLength){

            inventorySub();

            function inventorySub(){

            if (appliancesCount < appliancesLength){
                
                let name=adapter.namespace + '.' + appliancesArray.data.homeappliances[appliancesCount].name;
                let brand=appliancesArray.data.homeappliances[appliancesCount].brand;
                let vib=appliancesArray.data.homeappliances[appliancesCount].vib;
                let connected=appliancesArray.data.homeappliances[appliancesCount].connected;
                let type=appliancesArray.data.homeappliances[appliancesCount].type;
                let enumber=appliancesArray.data.homeappliances[appliancesCount].enumber;
                let haId=appliancesArray.data.homeappliances[appliancesCount].haId;

                adapter.setObject(name, {
                    type: 'state',
                    common: {
                        name: 'Name',
                        type: 'mixed',
                        role: 'indicator'
                    },
                    native: {}
                });

                adapter.setObject(name + '.brand', {
                    type: 'state',
                    common: {
                        name: 'brand',
                        type: 'mixed',
                        role: 'indicator'
                    },
                    native: {}
                });

                adapter.setObject(name + '.vib', {
                    type: 'state',
                    common: {
                        name: 'vib',
                        type: 'mixed',
                        role: 'indicator'
                    },
                    native: {}
                });

                adapter.setObject(name + '.connected', {
                    type: 'state',
                    common: {
                        name: 'connected',
                        type: 'boolean',
                        role: 'indicator'
                    },
                    native: {}
                });

                adapter.setObject(name + '.type', {
                    type: 'state',
                    common: {
                        name: 'type',
                        type: 'mixed',
                        role: 'indicator'
                    },
                    native: {}
                });

                adapter.setObject(name + '.enumber', {
                    type: 'state',
                    common: {
                        name: 'enumber',
                        type: 'mixed',
                        role: 'indicator'
                    },
                    native: {}
                });

                adapter.setObject(name + '.haId', {
                    type: 'state',
                    common: {
                        name: 'haId',
                        type: 'mixed',
                        role: 'indicator'
                    },
                    native: {}
                });

                setTimeout(function(){
                    appliancesStates()
                },3000);

                function appliancesStates(){
                    adapter.setState(name + '.brand', brand);
                    adapter.setState(name + '.vib', vib);
                    adapter.setState(name + '.connected', connected);
                    adapter.setState(name + '.type', type);
                    adapter.setState(name + '.enumber', enumber);
                    adapter.setState(name + '.haId', haId);
                }
                appliancesCount ++;
                    inventorySub();
            }
        }
        }
    }

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

    if (id==adapter.namespace + '.dev.token'){
        adapter.log.info('Token wurde geändert!');
        let token=state.val;

        adapter.setState('dev.access', true);

        auth.getAppliances(token).then(
            (appliances)=>{
                adapter.setState(adapter.namespace + '.dev.homeappliancesJSON', JSON.stringify(appliances));
            },
            (statusGet)=>{
                if (statusGet=='400'){
                adapter.log.error('XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX');
                }else{
                adapter.log.error("Irgendwas stimmt da wohl nicht!! Token!!    Fehlercode: " + statusGet );
            }
            }
        )   
    }
    
    if (id==adapter.namespace + '.dev.devCode'){
        adapter.log.info('Devicecode wurde geändert!');
        //let deviceCode=state.val;
        getTokenInterval=setInterval(getToken,10000);
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
let stat=adapter.namespace + '.dev.access';

stateGet(stat).then(
    (value)=>{
        //adapter.log.info('STATE(1): ' + value);
            if (value == false){

            auth.authUriGet(scope,clientID).then(
                ([authUri,devCode,pollInterval])=>{
                    adapter.log.error("Authorization-URI ====>  " + authUri);
                    adapter.setState('dev.authUriComplete', authUri);
                    adapter.setState('dev.devCode', devCode);
                    //adapter.log.info('Poll-Interval: ' + pollInterval + ' sec.');
                    adapter.setState('dev.pollInterval', pollInterval);
                },
                statusPost=>{
                    if (statusPost=='400'){
                        adapter.log.error('400 Bad Request (invalid or missing request parameters)');
                    }else{
                    adapter.log.error("Irgendwas stimmt da wohl nicht!!    Fehlercode: " + statusPost );
                }
            }
            );
            }else if (value == true){
                let stat=adapter.namespace + '.dev.token';
                stateGet(stat).then(
                    (value)=>{
                        adapter.log.error('Devicecode schon vorhanden');
                        let token=value;
                        auth.getAppliances(token).then(
                            (appliances)=>{
                                adapter.setState(adapter.namespace + '.dev.homeappliancesJSON', JSON.stringify(appliances));
                            },
                            (statusGet)=>{
                                if (statusGet=='400'){
                                    adapter.log.error('XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX');
                                }else{
                                adapter.log.error("Irgendwas stimmt da wohl nicht!! Token!!    Fehlercode: " + statusGet );
                            }
                            }
                        )
                    },
                    err=>{
                            adapter.log.error('FEHLER: ' + err);
                    }
                )
            }
    },
    err=>{
            adapter.log.error('FEHLER: ' + err);
    }
)

    
    adapter.setObject('dev.authUriComplete', {
        type: 'state',
        common: {
            name: 'AuthorizationURI',
            type: 'mixed',
            role: 'indicator'
        },
        native: {}
    });

    adapter.setObject('dev.devCode', {
        type: 'state',
        common: {
            name: 'DeviceCode',
            type: 'mixed',
            role: 'indicator'
        },
        native: {}
    });

    adapter.setObject('dev.pollInterval', {
        type: 'state',
        common: {
            name: 'Poll-Interval in sec.',
            type: 'mixed',
            role: 'indicator'
        },
        native: {}
    });

    adapter.setObject('dev.token', {
        type: 'state',
        common: {
            name: 'Access-Token',
            type: 'mixed',
            role: 'indicator'
        },
        native: {}
    });

    adapter.setObject('dev.refreshToken', {
        type: 'state',
        common: {
            name: 'Refresh-Token',
            type: 'mixed',
            role: 'indicator'
        },
        native: {}
    });

    adapter.setObject('dev.access',  {
        type: 'state',
        common: {
            name: 'access',
            type: 'boolean',
            role: 'indicator',
        },
        native: {}
    });

    adapter.setObject('dev.homeappliancesJSON', {
        type: 'state',
        common: {
            name: 'Homeappliances_JSON',
            type: 'object',
            role: 'indicator'
        },
        native: {}
    });

    adapter.setObject('dev.expires', {
        type: 'state',
        common: {
            name: 'Token expires in sec',
            type: 'number',
            role: 'indicator'
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