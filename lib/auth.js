'use strict';

const request =  require('request');



function init(scope){
      let scopeReturn=scope;
      return scopeReturn;
}

module.exports.init=init;

function post(scope,clientID){

    request(
      { method: 'POST',
        url: 'https://api.home-connect.com/security/oauth/device_authorization',
        body: 'client_id=' + clientID + '&scope=' + scope,
        headers: {
              'Content-Type': 'application/x-www-form-urlencoded'

  		}
      },


    function (error, response, body)
    {
      if (!error){
      //obj = JSON.parse(body);
      //deviceCode=obj.device_code;
      //return error,deviceCode;
      return error;
    }
    }
  );

}

module.exports.post=post;
