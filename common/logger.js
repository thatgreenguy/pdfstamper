// Module		: logger.js
// Description		: Common application logging.
// Author		: Paul Green
// Dated		: 2015-09-03
//
//
// 

var winston = require('winston');

winston.emitErrs = true;

var logger = new winston.Logger({
    transports: [
        new winston.transports.File({
            level: 'debug',
            filename: './src/logs/pdfhandler.log',
            handleExceptions: true,
            json: true,
            maxsize: 54558720,
            maxFiles: 7,
            colorize: false 
        }),
        new winston.transports.Console({
            level: 'verbose',
            handleExceptions: true,
            json: false,
            colorize: true
        })
    ],
    exitOnError: false
});

module.exports = logger;
module.exports.stream = {
    write: function(message, encoding) {
        logger.info(message);
    }
};


