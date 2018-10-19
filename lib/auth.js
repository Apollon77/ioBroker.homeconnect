'use strict';

const request =  require('request');



function init(scope){
      let scopeReturn=scope;
      return scopeReturn;
}

module.exports.init=init;

function post(){

    request(
    { method: 'POST',
      url: 'https://api.home-connect.com/security/oauth/device_authorization',
      body: {
            'client_id': clientID,
            'scope': scope,
      headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
		}
    },
    function (error, response, body)
    {
     jsonArray=JSON.parse(body);
     let deviceCode='Device-Code: ' + JSON.stringify(jsonArray.device_code);
     return error,deviceCode;
    }
  );

}

module.exports.post=post;
