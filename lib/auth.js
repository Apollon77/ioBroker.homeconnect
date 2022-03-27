"use strict";

const request = require("request");

function authUriGet(scope, clientID) {
    const param = "client_id=" + clientID + "&scope" + scope;

    return new Promise((resolve, reject) => {
        request(
            {
                method: "POST",
                url: "https://api.home-connect.com/security/oauth/device_authorization",
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                },
                body: param,
            },

            function (error, response, body) {
                if (!error && response.statusCode != 200) {
                    const statusPost = response.statusCode;
                    reject(statusPost);
                } else {
                    const obj = JSON.parse(body);
                    const authUri = obj.verification_uri_complete;
                    const devCode = obj.device_code;
                    const pollInterval = obj.interval;
                    resolve([authUri, devCode, pollInterval]);
                }
            }
        );
    });
}

function tokenGet(deviceCode, clientID) {
    const param = "grant_type=device_code&device_code=" + deviceCode + "&client_id=" + clientID;

    return new Promise((resolve, reject) => {
        request(
            {
                method: "POST",
                url: "https://api.home-connect.com/security/oauth/token",
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                },
                body: param,
            },

            function (error, response, body) {
                if (!error && response.statusCode != 200) {
                    const statusPost = response.statusCode;
                    reject(statusPost);
                } else {
                    const obj = JSON.parse(body);

                    const token = obj.access_token;
                    const refreshToken = obj.refresh_token;
                    const expires = obj.expires_in;
                    const tokenScope = obj.scope;
                    resolve([token, refreshToken, expires, tokenScope]);
                }
            }
        );
    });
}

function getAppliances(token) {
    const param = {
        Authorization: "Bearer " + token,
        Accept: "application/vnd.bsh.sdk.v1+json",
    };

    return new Promise((resolve, reject) => {
        request(
            {
                method: "GET",
                url: "https://api.home-connect.com/api/homeappliances",
                headers: param,
            },
            function (error, response, body) {
                try {
                    if (!error && response.statusCode != 200) {
                        const statusGet = response.statusCode;
                        const errorString = JSON.parse(body);
                        const description = errorString.error.description;
                        reject([statusGet, description + " " + errorString]);
                    } else {
                        const appliances = JSON.parse(body);
                        resolve(appliances);
                    }
                } catch (error) {
                    reject([0, body]);
                }
            }
        );
    });
}

function tokenRefresh(refreshToken) {
    const param = "grant_type=refresh_token&refresh_token=" + refreshToken;

    return new Promise((resolve, reject) => {
        request(
            {
                method: "POST",
                url: "https://api.home-connect.com/security/oauth/token",
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                },
                body: param,
            },

            function (error, response, body) {
                try {
                    if (!error && response.statusCode != 200) {
                        const statusGet = response.statusCode;
                        const errorString = JSON.parse(body);
                        const description = errorString.error.description;
                        reject([statusGet, description + " " + body]);
                    } else {
                        const obj = JSON.parse(body);
                        const token = obj.access_token;
                        const refreshToken = obj.refresh_token;
                        const expires = obj.expires_in;
                        const tokenScope = obj.scope;
                        resolve([token, refreshToken, expires, tokenScope]);
                    }
                } catch (error) {
                    reject([0, body]);
                }
            }
        );
    });
}

module.exports.authUriGet = authUriGet;
module.exports.tokenGet = tokenGet;
module.exports.getAppliances = getAppliances;
module.exports.tokenRefresh = tokenRefresh;
