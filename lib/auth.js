'use strict';

const request =  require('request');



function init(scope){
      let scopeReturn=scope;
      return scopeReturn;
}

module.exports.init=init;

function post(scope,clientID){

  let param="client_id=" + clientID + "&scope"+scope;

    request(
      { method: 'POST',
        url: 'https://api.home-connect.com/security/oauth/device_authorization',
        headers: {'Content-Type': 'application/x-www-form-urlencoded'},
        body: param
      },


    function (error, response, body)
    {
      if (!error && response.statusCode != 200){
        console.error(response.statusCode);
      return response.statusCode;
    }else {
      let obj = JSON.parse(body);
      deviceCode=obj.device_code;
      return deviceCode;
    }
    }
  );

}

module.exports.post=post;
