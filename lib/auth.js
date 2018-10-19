'use strict';

const request =  require('request');



function init(scope){
      let scopeReturn=scope;
      return scopeReturn;
}

module.exports.init=init;

function post(scope,clientID){

    request(
    { headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        url: 'https://api.home-connect.com/security/oauth/device_authorization',
        body: {
              'client_id': clientID,
              'scope': scope
        },
      method: 'POST'
    },


    function (error, response, body)
    {
      obj = JSON.parse(body);
      deviceCode=obj.device_code;
      return error,deviceCode;
    }
  );

}

module.exports.post=post;
