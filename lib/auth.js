'use strict';

const request =  require('request');


function devCodeGet(scope,clientID){

  let param="client_id=" + clientID + "&scope"+scope;

  return new Promise((resolve, reject) => {

    request(
      { method: 'POST',
        url: 'https://api.home-connect.com/security/oauth/device_authorization',
        headers: {'Content-Type': 'application/x-www-form-urlencoded'},
        body: param
      },

    function (error, response, body){

      if (!error && response.statusCode != 200){
  
      reject (response.statusCode);
    }else {
         
      //let obj = JSON.parse(body);
      //let devCode=obj.device_code;
      //let uriComplete=obj.verification_uri_complete;
      //let bodyAuth=body;
      resolve (body);
    
    }    
    
    }

  );
    });
}

module.exports.devCodeGet=devCodeGet;