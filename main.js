
'use strict';

const utils =    require(__dirname + '/lib/utils'); // Get common adapter utils
const BSHapi =   require(__dirname + '/lib/BSHapi.json');
const auth =     require(__dirname + '/lib/auth.js');
const stream =   require(__dirname + '/lib/stream.js');

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
        auth.tokenGet(deviceCode,clientID).then(
            ([token,refreshToken,expires,tokenScope])=>{
                adapter.log.info('Accestoken generiert!');
                adapter.setState('dev.token', {val: token, ack: true});
                adapter.setState('dev.refreshToken', {val: refreshToken, ack: true});
                adapter.setState('dev.expires', {val: expires, ack: true});
                adapter.setState('dev.tokenScope', {val: tokenScope, ack: true});
                clearInterval(getTokenInterval);

                getTokenRefreshInterval=setInterval(getRefreshToken,3600000);

                function getRefreshToken(){
                auth.tokenRefresh(refreshToken).then(
                    ([token,refreshToken,expires,tokenScope])=>{
                        adapter.log.info('Accestoken erneuert...');
                        adapter.setState('dev.token', {val: token, ack: true});
                        adapter.setState('dev.refreshToken', {val: refreshToken, ack: true});
                        adapter.setState('dev.expires', {val: expires, ack: true}); 
                        adapter.setState('dev.tokenScope', {val: tokenScope, ack: true});
                    },
                    statusPost=>{
                        if (statusPost=='400'){
                            adapter.log.error('FEHLER beim Refresh-Token!');
                        }else{
                        adapter.log.error("Irgendwas stimmt da wohl nicht!! Refresh-Token!!    Fehlercode: " + statusPost );
                    }
                    }
                )
            }                        
            },
            statusPost=>{
                if (statusPost=='400'){
                    let stat='dev.authUriComplete';
        
                    stateGet(stat).then(
                    (value)=>{
                        adapter.log.error('Bitte ioBroker authorisieren!!  =====>>>   ' + value);
                    },
                    err=>{
                        adapter.log.error('FEHLER: ' + err);
                    }
                    );
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

                adapter.setObjectNotExists(name + '.General.currentStatusJSON', {
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

                adapter.setObjectNotExists(name + '.General.programsAvailableJSON', {
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
                
                adapter.setObjectNotExists(name + '.General.settingsAvailableJSON', {
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

                adapter.setObjectNotExists(name, {
                    type: 'state',
                    common: {
                        name: 'Name',
                        type: 'mixed',
                        role: 'indicator',
                        write: false,
                        read: true
                    },
                    native: {}
                });

                adapter.setObjectNotExists(name + '.General.brand', {
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

                adapter.setObjectNotExists(name + '.General.vib', {
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

                adapter.setObjectNotExists(name + '.General.connected', {
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

                adapter.setObjectNotExists(name + '.General.type', {
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

                adapter.setObjectNotExists(name + '.General.enumber', {
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

                adapter.setObjectNotExists(name + '.General.haId', {
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
            let stat=adapter.namespace + '.dev.token';
                stateGet(stat).then(
                    (value)=>{
                        let token=value;
                        
                        auth.getCurrentStatus(token,haId).then(
                            (currentStatus)=>{
                                adapter.setState(name + '.General.currentStatusJSON', JSON.stringify(currentStatus));
                                    let regex=/([^.]+)\.?$/gm;
                                    let currentStatusArray=JSON.parse(JSON.stringify(currentStatus));
                                    let currentStatusLength=currentStatusArray.data.status.length;
                                    let currentStatusCount=0;
                                    
                                        currentStatusSetDp();

                                        function currentStatusSetDp(){
                                            if (currentStatusCount < currentStatusLength){
                                                let currentStatusDp=currentStatusArray.data.status[currentStatusCount].key;
                                                    let dp = currentStatusDp.match(regex);
                                                    adapter.setObjectNotExists(name + '.Status.' + dp, {
                                                        type: 'state',
                                                        common: {
                                                            name: currentStatusDp,
                                                            type: typeof(currentStatusArray.data.status[currentStatusCount].value),
                                                            role: 'indicator',
                                                            write: true,
                                                            read: true
                                                        },
                                                        native: {}
                                                    });
                                                        adapter.setState(name + '.Status.' + dp, currentStatusArray.data.status[currentStatusCount].value);

                                                currentStatusCount++;
                                                currentStatusSetDp();
                                            }
                                        }

                            },
                    ([statusGet,description])=>{
                        if (statusGet=='400'){
                            adapter.log.error('XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX');
                        }else{
                            adapter.log.error('2:  Fehlercode: ' + statusGet + '   haId: ' + haId);
                            adapter.log.error(description);
            }
            }
        );
/*

verfügbare Programme

*/
                        auth.getProgramsAvailable(token,haId).then(
                            (programsAvailable)=>{
                                adapter.setState(name + '.General.programsAvailableJSON', JSON.stringify(programsAvailable));
                                let regex=/([^.]+)\.?$/gm;
                                    let programsAvailableArray=JSON.parse(JSON.stringify(programsAvailable));
                                    let programsAvailableLength=programsAvailableArray.data.programs.length;
                                    let programsAvailableCount=0;
                                    
                                    programsAvailableSetDp();

                                        function programsAvailableSetDp(){
                                            if (programsAvailableCount < programsAvailableLength){
                                                let programsAvailableDp=programsAvailableArray.data.programs[programsAvailableCount].key;
                                                    let dp = programsAvailableDp.match(regex);
                                                    adapter.setObjectNotExists(name + '.Programs.' + dp, {
                                                        type: 'state',
                                                        common: {
                                                            name: programsAvailableDp,
                                                            type: 'boolean',
                                                            role: 'button',
                                                            write: true,
                                                            read: true
                                                        },
                                                        native: {}
                                                    });
                                                        adapter.setState(name + '.Programs.' + dp, false);

                                                        programsAvailableCount++;
                                                        programsAvailableSetDp();
                                            }
                                        }
                            },
                        ([statusGet,description])=>{
                        if (statusGet=='400'){
                            adapter.log.error('XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX');
                        }else{
                            adapter.log.error('3: Fehlercode: ' + statusGet + '   haId: ' + haId);
                            adapter.log.error(description);
            }
            }
        );

/*        

verfügbare Settings 

*/ 

auth.getSettingsAvailable(token,haId).then(
    (settingsAvailable)=>{
        adapter.setState(name + '.General.settingsAvailableJSON', JSON.stringify(settingsAvailable));
        let regex=/([^.]+)\.?$/gm;
            let settingsAvailableArray=JSON.parse(JSON.stringify(settingsAvailable));
            let settingsAvailableLength=settingsAvailableArray.data.settings.length;
            let settingsAvailableCount=0;
            
            settingsAvailableSetDp();

                function settingsAvailableSetDp(){
                    if (settingsAvailableCount < settingsAvailableLength){
                        let settingsAvailableDp=settingsAvailableArray.data.settings[settingsAvailableCount].key;
                        let settingsAvailableDpValue=settingsAvailableArray.data.settings[settingsAvailableCount].value;
                            let dp = settingsAvailableDp.match(regex);
                            let dpValue=settingsAvailableDpValue.match(regex);
                            
                                                       
                            adapter.setObjectNotExists(name + '.Settings.' + dp, {
                                type: 'state',
                                common: {
                                    name: settingsAvailableDp,
                                    type: typeof(dpValue),
                                    role: 'indicator',
                                    write: true,
                                    read: true
                                },
                                native: {}
                            });
                                adapter.log.info('Value: '+name + '.Settings.' + dp + ' : ' + dpValue);
                                adapter.setState(name + '.Settings.' + dp,  {val: dpValue, ack: true});

                                settingsAvailableCount++;
                                settingsAvailableSetDp();
                    }
                }
    },
([statusGet,description])=>{
if (statusGet=='400'){
    adapter.log.error('XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX');
}else{
    adapter.log.error('4: Fehlercode: ' + statusGet + '   haId: ' + haId);
    adapter.log.error(description);
}
}
);

//////////////////

},
                    err=>{
                        adapter.log.error('FEHLER: ' + err);
                    }
                    );


/////////////////////////////////////////////////////////////////////////////////////////////*/

                setTimeout(function(){
                    appliancesStates()
                },3000);

                function appliancesStates(){
                    adapter.setState(name + '.General.brand', brand);
                    adapter.setState(name + '.General.vib', vib);
                    adapter.setState(name + '.General.connected', connected);
                    adapter.setState(name + '.General.type', type);
                    adapter.setState(name + '.General.enumber', enumber);
                    adapter.setState(name + '.General.haId', haId);
                }
                appliancesCount ++;
                stream.receive(token,haId);                   
                    inventorySub();
            }
        }
        }
    }

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

    if (id==adapter.namespace + '.dev.token'){
        let token=state.val;
        adapter.setState('dev.access', true);

        auth.getAppliances(token).then(
            (appliances)=>{
                adapter.setState(adapter.namespace + '.dev.homeappliancesJSON', JSON.stringify(appliances));
            },
            ([statusGet,description])=>{
                if (statusGet=='400'){
                adapter.log.error('XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX');
                }else{
                adapter.log.error("1: Irgendwas stimmt da wohl nicht!!     Fehlercode: " + statusGet );
                adapter.log.error(description);
            }
            }
        )   
    }
    
    if (id==adapter.namespace + '.dev.devCode'){
        getTokenInterval=setInterval(getToken,10000);          // Polling bis Authorisation erfolgt ist
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
	
let scope=adapter.config.scope;
let clientID=adapter.config.clientID;
let stat=adapter.namespace + '.dev.access';

stateGet(stat).then(
    (value)=>{
            if (value == false){

            auth.authUriGet(scope,clientID).then(
                ([authUri,devCode,pollInterval])=>{
                    adapter.setState('dev.authUriComplete', authUri);
                    adapter.setState('dev.devCode', devCode);
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

    adapter.setObjectNotExists('dev.access',  {
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

    
    //settingsAvailableJSON

    adapter.subscribeStates('*');
  
}