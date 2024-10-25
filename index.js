const net = require('net'); //for TCP protocol
const Parser = require('redis-parser');

//take a store for storing the value of key and value
const store = {}; 
const ttlStore = {}; //This wil, track the TTL(time-to-live) for keys

const server = net.createServer(connection => {
  console.log('Client connected...')

  connection.on('data', data => {
    const parser = new Parser({
      returnReply: (reply) => {
        const command = reply[0].toLowerCase();
        const key = reply[1]; 

        //function to check if a key has expired and remove it
        const checkExpiry = (key) => {
          if(ttlStore[key] && ttlStore[key] <= Date.now()){
            delete store[key];
            delete ttlStore[key];
          }
        };
        //perform the expiration check for very command
        if(key) checkExpiry(key);

        switch(command){
          //Firsr, redis health checkup
          case 'ping' : {
            connection.write('+PONG\r\n');
            break;
          }

          //for string set,get n al
          case 'set': {
            const value = reply[2];
            store[key] = value;
            delete ttlStore[key]; // Remove TTL if it was set before
            connection.write('+OK\r\n');
            break;
          }
          case 'get': {
            const value = store[key];
            if (!value) {
              connection.write('$-1\r\n');
            } else {
              connection.write(`$${value.length}\r\n${value}\r\n`);
            }
            break;
          }
          case 'del': {
            if(store[key]){
              delete store[key];
              delete ttlStore[key];
              connection.write(':1\r\n'); //OK
            }else{
              connection.write(':0\r\n'); //false
            }
            break;
          }
          case 'exists': {
            if(store[key]){
              connection.write(':1\r\n'); //true
            }else{
              connection.write(':0\r\n'); //false
            }
            break;
          }
          case 'incr':{
            const incrValue = parseInt(reply[2]);
            if(!store[key]){
              store[key] = '0';
            }
            const newValue = parseInt(store[key])+incrValue;
            store[key] = newValue.toString();
            connection.write(`:${newValue}\r\n`);
            break;
          }
          case 'expire' : {
            const ttl = parseInt(reply[2]);
            if(store[key]){
              ttlStore[key] = Date.now() + ttl * 1000;
              connection.write(':1\r\n');
            }else{
              connection.write(':0\r\rn');
            }
            break;
          }
          case 'ttl' : {
            if(!store[key]){
              connection.write(':-2\r\n');
            }else if(!ttlStore[key]){
              connection.write(':-1\r\n');
            }else{
              const ttl = Math.floor((ttlStore[key] - Date.now()) / 1000);
              connection.write(`:${ttl}\r\n`);
            }
            break;
          }

          // LIST comamands
          case 'lpush' : {
            const value = reply[2];
            if(!Array.isArray(store[key])){
              store[key] = []; //
            }
            store[key].unshift(value); //left side push
            connection.write(`:${store[key].length}\r\n`);
            break;
          }
          case 'rpush' : {
            const value = reply[2];
            if(!Array.isArray(store[key])){
              store[key] = [];
            }
            store[key].push(value); //right side push
            connection.write(`:${store[key].length}\r\n`);
            break;
          }
          case 'lpop' : {
            if(!Array.isArray(store[key]) || store[key].length === 0){
              connection.write('$-1\r\n');
            }else{
              const value = store[key].shift();
              connection.write(`$${value.length}\r\n${value}\r\n`);
            }
            break;
          }
          case 'rpop' : {
            if(!Array.isArray(store[key]) || store[key].length === 0){
              connection.write('$-1\r\n');
            }else{
              const value = store[key].pop();
              connection.write(`$${value.length}\r\n${value}\r\n`);
            }
            break;
          }
          case 'lrange': {
            const start = parseInt(reply[2]);
            const end = parseInt(reply[3]);
            if (!Array.isArray(store[key])) {
              connection.write('*0\r\n');
            } else {
              const range = store[key].slice(start, end + 1);
              connection.write(`*${range.length}\r\n`);
              range.forEach(item => connection.write(`$${item.length}\r\n${item}\r\n`));
            }
            break;
          }

          //Set Commands
          case 'sadd' : {
            const value = reply[2];
            if(!store[key]){
              store[key] = new Set();
            }
            const sizeBefore = store[key].size;
            store[key].add(value);
            const sizeAfter = store[key].size;
            connection.write(`:${sizeAfter - sizeBefore}\r\n`);
            break;
          }
          case 'smembers' : {
            if(!store[key] || !(store[key] instanceof Set)){
              connection.write('*0\r\n');
            }else{
              const members = Array.from(store[key]);
              connection.write(`*${members.length}\r\n`);
              members.forEach(member => connection.write(`$${member.length}\r\n${member}\r\n`));
            }
            break;
          }
          case 'sismember' : {
            const value = reply[2];
            if(store[key] && store[key] instanceof Set && store[key].has(value)){
              connection.write(':1\r\n');
            }else{
              connection.write(':0\r\n');
            }
            break;
          }

          //HASH commands
          case 'hset' : {
            const field = reply[2];
            const value = reply[3];
            if(!store[key]){
              store[key] = {};
            }
            store[key][field] = value;
            connection.write(':1\r\n');
            break;
          }
          case 'hget' : {
            const field = reply[2];
            if(!store[key] || typeof store[key] !== 'object' || !(field in store[key])){
              connection.write('$-1\r\n');
            }else{
              const value = store[key][field];
              connection.write(`$${value.length}\r\n${value}\r\n`);
            }
            break;
          }
          case 'hgetall' : {
            if(!store[key] || typeof store[key] !== 'object'){
              connection.write('*0\r\n');
            }else{
              const fields = Object.entries(store[key]);
              connection.write(`*${fields.length * 2}\r\n`);
              fields.forEach(([field, value]) => {
                connection.write(`$${field.length}\r\n${field}\r\n`);
                connection.write(`$${value.length}\r\n${value}\r\n`);
              });
            }
            break;
          }
          default:
            connection.write('-ERR unknown command\r\n');
        }
      },
      returnError: (err) => {
        console.log('Parser Error =>', err);
        connection.write(`-ERR ${err.message}\r\n`);
      }
    })
    // console.log('=>', data.toString())
    parser.execute(data);
    // connection.write('+OK\r\n')
  })
})

server.listen(8000, () => {
  console.log("Server is listening on 8000");
})