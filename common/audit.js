// Module		: audit.js
// Description		: Common Audit file logging related functions.
// Author		: Paul Green
// Dated		: 2015-08-03
//
// Application maintains a simple audit log file within Jde which is used for informational purposes and by the
// application itself to determine the last Pdf processed - determines date and time to run query checks from. 
  

var oracledb = require( 'oracledb' ),
  logger = require( './logger' ),
  moment = require( 'moment' ),
  credentials = { user: process.env.DB_USER, password: process.env.DB_PWD, connectString: process.env.DB_NAME };


// Insert new Audit entry into the JDE audit log file.
exports.createAuditEntry = function( pdfjob, genkey, ctrid, status ) {

  var dt,
  timestamp,
  jdedate,
  jdetime,
  query;

  dt = new Date();
  timestamp = exports.createTimestamp( dt );
  jdedate = exports.getJdeJulianDate( dt );
  jdetime = exports.getJdeAuditTime( dt );

  if ( typeof( pdfjob ) === 'undefined' ) pdfjob = ' ';
  if ( typeof( genkey ) === 'undefined' ) genkey = ' ';
  if ( typeof( ctrid ) === 'undefined' ) ctrid = ' ';
  if ( typeof( status ) === 'undefined' ) status = ' ';

  oracledb.getConnection( credentials, function(err, connection) {
    if ( err ) { 
      logger.error( 'Oracle DB Connection Failure' );
      return;
    }

    query = "INSERT INTO testdta.F559859 VALUES (:pasawlatm, :pafndfuf2, :pablkk, :paactivid, :padeltastat, :papid, :pajobn, :pauser, :paupmj, :paupmt)";
 
    connection.execute( query, [timestamp, pdfjob, genkey, ctrid, status, 'PDFHANDLER', 'CENTOS', 'DOCKER', jdedate, jdetime ], { autoCommit: true }, function( err, result ) {
      if ( err ) {
        logger.error( err.message );
        return;
      }
      connection.release( function( err ) {
        if ( err ) {
          logger.error( err.message );
          return;
        }
      });
    });
  });
}


// Create human readable timestamp string suitable for Audit Logging - Returns timestamp string like 'YYYY-MM-DD T HH:MM:SS MMMMMMMMM'
// Date and time elements are padded with leading '0' by default. Date and Time separator characters are '-' and ':' by default.
// MMMMMMMMM is time as milliseconds since epoch to keep generated string unique for same second inserts to Audit Log table. 
exports.createTimestamp = function( dt, dateSep, timeSep, padChar ) {

  if ( typeof( dt ) === 'undefined' ) dt = new Date();
  if ( typeof( dateSep ) === 'undefined' ) dateSep = '-';
  if ( typeof( timeSep ) === 'undefined' ) timeSep = ':';
  if ( typeof( padChar ) === 'undefined' ) padChar = '0';
  
  return dt.getFullYear() + dateSep + ( padChar + ( dt.getMonth() + 1 ) ).slice( -2 ) + dateSep + ( padChar + dt.getDate() ).slice( -2 )
    + ' T ' + ( padChar + dt.getHours() ).slice( -2 ) + timeSep + ( padChar + dt.getMinutes() ).slice( -2 ) + timeSep
    + ( padChar + dt.getSeconds() ).slice( -2 ) + ' ' + dt.getTime();
}


// Converts date to JDE Julian style date i.e. CYYDDD
exports.getJdeJulianDate = function( dt ) {

  var wkM,
    wkYYYY,
    wkDDD;

  if ( typeof( dt ) === 'undefined' ) dt = new Date();

  wkM = moment( dt );

  wkYYYY = wkM.year();
  wkDDD = wkM.dayOfYear();
  return wkYYYY - 1900 + ( '000' + wkDDD).slice( -3 );

}


// Convert date to JDE Audit Time HHMMSS - Return jde Audit time in format HHMMSS with no separators and leading 0's if required.
exports.getJdeAuditTime = function( dt, padChar ) {

  var jdetime;

  if ( typeof( dt ) === 'undefined' ) dt = new Date();
  if ( typeof( padChar ) === 'undefined' ) padChar = '0';

  jdetime = ( padChar + dt.getHours() ).slice( -2 ) + ( padChar + dt.getMinutes() ).slice( -2 ) + ( padChar + dt.getSeconds() ).slice( -2 );

  return jdetime;
}


// Reduce audit timestamp value by x minutes and return adjusted value plus Jde date and Time equivalents
// Accepts timestamp string (from audit file) and returns date adjusted by x minutes
// as well as JDE Julian Date and JDE Julian Time Audit value equivalants 
exports.adjustTimestampByMinutes = function( timestamp, mins ) {

  var millisecs = null,
  n = null,
  dt = new Date(),
  adjdt = null,
  newdt,
  newtm;
	
  // Date and Time should be passed if not set to zeros and return adjusted by minutes value
  if ( typeof( mins ) === 'undefined' ) mins = -5;
  if ( typeof( timestamp ) !== 'undefined' ) {
    millisecs = timestamp.substr( 22, 13 );
    n = parseInt( millisecs );
    dt = new Date( n );
  }

  // Get timestamp date adjusted by however minutes
  adjdt = new Date( dt.setMinutes( dt.getMinutes() + mins ) );
	
  // Return Jde Julian style Date and Times 
  newdt = module.exports.getJdeJulianDate( adjdt );
  newtm = module.exports.getJdeAuditTime( adjdt );

  return {'jdeDate': newdt, 'jdeTime': newtm, 'timestamp': dt, 'minutes': mins };
}
