var express = require('express');

var PORT = process.env.PORT || 8080;

var app = express();
app.get('/', function( req, res) {
  res.send('Hello World!');
});

app.listen(PORT);
console.log('DLINK PDF Logo Stamper web app running on http://localhost:' + PORT);
