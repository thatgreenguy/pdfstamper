// pdfhandler.js  : Apply Dlink logo images to select JDE generated Pdf files   
// Author         : Paul Green
// Date           : 2015-09-10
//
// Synopsis
// --------
//
// Establish remote mount connectivity via sshfs to the Jde PrintQueue directory on the (AIX) Enterprise server
// Perform high frequency polling of the Oracle (JDE) table which holds information on Jde UBE jobs
// When detecting new JDE PDF files that have been configured (in Jde) to receive logo images - for example 
// Print Invoice - Copy the file, add logos to each page then replace the original Jde generated Pdf with the new 
// version which includes Dlink logos.


var oracledb = require( 'oracledb' ),
  log = require( './common/logger.js' ),
  mounts = require( './common/mounts.js' ),
  audit = require( './common/audit.js' ),
  pdfChecker = require( './pdfchecker.js' ),
  pollInterval = 3000,
  dbCn = null,
  dbCredentials = { user: process.env.DB_USER, password: process.env.DB_PWD, connectString: process.env.DB_NAME },
  hostname = process.env.HOSTNAME,
  logLevel = process.env.LOG_LEVEL,
  lastPdf = null;


// - Initialisation
//
// Set logging level for console output
if ( typeof(logLevel) === 'undefined' ) {
  logLevel = 'verbose';
}
log.transports.console.level = logLevel;

// Expect a valid docker hostname which is used for lock control and log file entries
log.info( '' );
log.info( '---------- Dlink PDF Logo Handler - Start Monitoring JDE PrintQueue Jobs ----------'  );

if ( typeof( hostname ) === 'undefined' || hostname === '' ) {
  log.error( 'pdfhandler.js expects environment variable HOSTNAME to be set by docker container' );
  log.error( 'pdfhandler.js has detected a serious error - aborting process!' );
  process.exit( 1 );

} else {

  // Get Oracle Db connection once then pass through to be re-used
  oracledb.getConnection( dbCredentials, function( err, cn ) {
    if ( err ) {
      log.error( 'Oracle DB connection Failure : ' + err );
      process.exit( 1 );
    } 

    // Save, pass and reuse the connection
    dbCn = cn;

    // Log process startup in Jde Audit table 
    audit.createAuditEntry( 'pdfhandler', 'pdfhandler.js', hostname, 'Start Jde Pdf Logo handler' );

    // When process start perform the polled processing immediately then it will repeat periodically
    performPolledProcess();

  });
}


// - Functions
//
// Initiates polled process that is responsible for applying logo images to new Jde Pdf files
function performPolledProcess() {

  // Check remote mounts to Jde Pdf files are working then process
  mounts.checkRemoteMounts( performPostRemoteMountChecks );

}

// Handles scheduling of the next run of the frequently polled process 
function scheduleNextPolledProcess() {

  log.verbose( 'Schedule the next Polled process in : ' + polledInterval + ' milliseconds' );
  setTimeout( performPolledProcess, pollInterval );

}


// Called after remote mounts to Jde have been checked
function performPostRemoteMountChecks( err, data ) {

  if ( err ) {

    // Problem with remote mounts so need to reconnect before doing anything else
    reconnectToJde( err );

  } else {

    // Remote mounts okay so go ahead and process, checking for new Pdf's etc
    pdfChecker.performJdePdfProcessing( dbCn, dbCredentials, pollInterval, hostname, lastPdf, performPolledProcess );
  }

}


// Problem with remote mounts to jde so attempt to reconnect 
function reconnectToJde( err ) {

    log.debug( 'Error data: ' +  err );
    log.warn( 'Issue with Remote mounts to JDE - Attempting to reconnect.' );

    mounts.establishRemoteMounts( performPostEstablishRemoteMounts );

}


// Called after establish remote mounts to Jde has been processed
function performPostEstablishRemoteMounts( err, data ) {

  if ( err ) {

    // Unable to reconnect to Jde at the moment so pause and retry shortly
    log.warn( '' );
    log.warn( 'Unable to re-establish remote mounts to Jde will pause and retry' );
    log.warn( '' );
    setTimeout( performPolledProcess, pollInterval );

  } else {

    // Remote mounts okay so go ahead and process, checking for new Pdf's etc
    log.verbose( 'Remote mounts to Jde re-established - will continue normally')
    pdfChecker.performJdePdfProcessing( dbCn, dbCredentials, pollInterval, hostname, lastPdf, performPolledProcess );
  }

}
