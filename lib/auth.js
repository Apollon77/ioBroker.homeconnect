'use strict';

const request =  require('request');

console.log("TEST");

function init(){
console.log(scope);
}

export {init};
/**
function post(){

    request(
    { method: 'POST',
      url: 'https://api.home-connect.com/security/oauth/device_authorization',
      body: {
            'client_id:' adapter.config.clientID,
            'scope:' adapter.config.scope
          }
      headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
		}
    },
    function (error, response, body)
    {
     adapter.log.error("POST-Fehlercode: " + error);
     jsonArray=JSON.parse(body);
     adapter.log.info('Device-Code: ' + JSON.stringify(jsonArray.device_code));

    }
  );

}
*/
