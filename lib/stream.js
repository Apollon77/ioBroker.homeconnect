'use strict';

//const EventEmitter = require('events');
//const EventSource = require('eventsource');


function receive(token,haId){
    
    let openStream = () => {
           let baseUrl="https://api.home-connect.com/api/homeappliances/"+haId+"/events";
           let header = { headers: { Authorization: 'Bearer ' + token, Accept: 'text/event-stream' } }
           console.log(header.headers.Authorization);
          this.eventSource = new EventSource(baseUrl, header);
    
           // Error handling
           this.eventSource.onerror = (err => {
               console.log(err.status);
             if (err.status !== undefined) {
               console.log('Error (' + this.haId + ')', err)
              if (err.status === 401) {
                
                // Most likely the token has expired, try to refresh the token
              console.log("Token abgelaufen");
                
              } else {
                throw(new Error(err.status))
              }
           }
          });
          this.eventSource.addEventListener('STATUS', (e) => processEvent(e), false)
          this.eventSource.addEventListener('NOTIFY', (e) => processEvent(e), false)
          this.eventSource.addEventListener('EVENT', (e) => processEvent(e), false)
          this.eventSource.addEventListener('CONNECTED', (e) => processEvent(e), false)
          this.eventSource.addEventListener('DISCONNECTED', (e) => processEvent(e), false)
          this.eventSource.addEventListener('KEEP-ALIVE', () => lastAlive = new Date(), false)
        }
    
        // Open the event stream
        openStream();
}




module.exports.receive=receive;