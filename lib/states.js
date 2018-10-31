'use strict';
const utils =    require(__dirname + '/lib/utils'); // Get common adapter utils
const adapter = new utils.Adapter('homeconnect');

function stateGet(stat){

return new Promise((resolve, reject) => {

adapter.getState(stat, function (err, state) {

    if (err){
        reject(err);
    }else{
        let value=state.val;
        resolve(value);
        
    }
}); 
});
}

module.exports.stateGet=stateGet;