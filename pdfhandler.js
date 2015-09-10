var mounts = require( './common/mounts.js' ),
  log = require( './common/logger.js' ),
  sleep = require( 'sleep' ),
  pollInterval = 3000;


// When application first starts perform the polled processing immediately
// it will then be scheduled to repeat periodically
performPolledProcess();


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
    performJdePdfProcessing( data );
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
    log.warn( 'Unable to re-establish remote mounts to Jde will pause and retry' );
    setTimeout( performPolledProcess, pollInterval );

  } else {

    // Remote mounts okay so go ahead and process, checking for new Pdf's etc
    logger.verbose( 'Remote mounts to Jde re-established - will continue normally')
    performJdePdfProcessing( data );
  }

}


function performJdePdfProcessing( data ) {

  log.debug( 'Result: ' +  data );
  log.verbose( 'Begin Jde Pdf processing - Checking for new Pdf files that need logo added' );

  // Connection to Jde remote mounts seem to be in place so continue processing
  // once processing complete schedule the polled process again  
  log.verbose( 'Perform JDE Processing WORK WORK WORK then go back to polling' );
  sleep( 3000 );
  performPolledProcess();

}

