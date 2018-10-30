'use strict';

const request =  require('request');


function authUriGet(scope,clientID){

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
        let statusPost=response.statusCode;
      reject (statusPost);
    }else {
         
      let obj = JSON.parse(body);
      let authUri=obj.verification_uri_complete;
      let devCode=obj.device_code;
      let pollInterval=obj.interval;
      resolve ([authUri, devCode,pollInterval]);
    
    }    
    
    }

  );
    });
}

function tokenGet(deviceCode,clientID){

  let param="grant_type=device_code&device_code=" + deviceCode + "&client_id=" + clientID;

  return new Promise((resolve, reject) => {

    request(
      { method: 'POST',
        url: 'https://api.home-connect.com/security/oauth/token',
        headers: {'Content-Type': 'application/x-www-form-urlencoded'},
        body: param
      },

    function (error, response, body){

      if (!error && response.statusCode != 200){
        let statusPost=response.statusCode;
      reject (statusPost);
    }else {
         
      let obj = JSON.parse(body);
      
      let token=obj.access_token;
      resolve ([token]);
    
    }    
    
    }

  );
  });
}





module.exports.authUriGet=authUriGet;
module.exports.tokenGet=tokenGet;