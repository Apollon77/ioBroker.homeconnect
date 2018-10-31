function stateGet(state){

return new Promise((resolve, reject) => {

adapter.getState(state, function (err, state) {

    if (!err){
        reject(err);
    }else{
        let value=state.val;
        resolve(value);
        
    }
}); 
});
}

module.exports.stateGet=stateGet;