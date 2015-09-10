// Module		: mounts.js
// Description		: Check remote mounts in place and establish or re-establish as necessary
// Author		: Paul Green
// Dated		: 2015-09-08


var async = require( 'async' ),
  log = require( './logger' ),
  exec = require( 'child_process' ).exec,
  remoteJdeDir = process.env.DIR_JDEPDF,
  remoteWorkDir = process.env.DIR_SHAREDDATA,
  localJdeDir = '/home/pdfdata',
  localWorkDir = '/home/shareddata',
  sshfsPassword = process.env.SSHFS_PWD,
  sshfsUser = process.env.SSHFS_USER,
  sshfsHost = process.env.SSHFS_HOST,
  sshfsServerKeepaliveSeconds = 30;



// Check mounts in place - once established they should remain semi-permanent
// Establish or re-establish mount directories to JDE Enterprise server on AIX.
module.exports.checkRemoteMounts = function( callback ) {
  async.series([
    function ( cb ) { checkJdeQueueMounted( cb ) }, 
    function ( cb ) { checkWorkDirMounted( cb ) } 	
    ], function( err, results ) {
         if ( err ) {
           log.warn( 'Problem with remote mounts - attempting auto recovery' );
	   callback( err, 'Remote mount check failed' );
         } else {
           log.debug( 'Remote mounts okay' );
           callback( null, 'Remote mount(s) check okay' );  
         }
       }
    );
}


// When issue detected with remote mounts to AIX Jde Enterprise server then establish or re-establish them
module.exports.establishRemoteMounts = function( callback ) {
  async.series([
    function ( cb ) { unmountJdeQueue( cb ) }, 
    function ( cb ) { unmountSharedWorkDir( cb ) }, 	
    function ( cb ) { mountJdeQueue( cb ) },
    function ( cb ) { mountSharedWorkDir( cb ) } 	
    ], function( err, results ) {
         if ( err ) {
           log.error( 'Unable to establish Remote mounts to AIX (JDE Enterprise Server)' );
           callback( err, 'Remote mount failed' );
         } else {
           log.info( 'Remote mounts established' );
           callback( null, 'Remote mount(s) established' );
         }
       }
    );
}


// Establish mount to remote JDE enterprise server (AIX) system for JDE Print Queue access/monitoring 
function mountJdeQueue( cb) {
  
  var cmd;

  cmd = 'echo ' + sshfsPassword + ' | ';
  cmd += 'sshfs -o reconnect -C -o workaround=all -o ServerAliveInterval='
  cmd += sshfsServerKeepaliveSeconds;
  cmd += ' -o Ciphers=arcfour  -o cache=no -o password_stdin '
  cmd += sshfsUser + '@' + sshfsHost + ':' + remoteJdeDir + ' ' +  localJdeDir;  
  
  exec( cmd, function( err, stdout, stderr ) {
    if ( err !== null ) {
      log.error( cmd + ' - Failed');  
      cb( err, cmd + ' - Failed' );
    } else {
      log.debug( cmd + ' - Done' );  
      cb(null, cmd + ' - Done');
    }
  });
}


// Establish mount to remote JDE enterprise server (AIX) system to use as a work area.
// Process will copy original PDF files here then manipulate them then copy new files back to JDE Output queue
// Files created here are transient and should be removed by this process immediately or periodically.
// If the pdfmonitor process is not running files in /home/pdfprint (work directory) can be safely removed 
function mountSharedWorkDir( cb) {
  
  var cmd;

  cmd = 'echo ' + sshfsPassword + ' | ';
  cmd += 'sshfs -o reconnect -C -o workaround=all -o ServerAliveInterval='
  cmd += sshfsServerKeepaliveSeconds;
  cmd += ' -o Ciphers=arcfour  -o cache=no -o password_stdin '
  cmd += sshfsUser + '@' + sshfsHost + ':' + remoteWorkDir + ' ' +  localWorkDir;  

  exec( cmd, function( err, stdout, stderr ) {
    if ( err !== null ) {
      log.error( cmd + ' - Failed');  
      cb( err, cmd + ' - Failed' );
    } else {
      log.debug( cmd + ' - Done' );  
      cb(null, cmd + ' - Done');
    }
  });
}


// Before attempting a mount perform an umount - start from clean state
function unmountJdeQueue( cb ) {

  var cmd;

  cmd = 'umount ' + localJdeDir;
  exec( cmd, function( err, stdout, stderr ) {
    if ( err !== null ) {
      log.debug( cmd + ' - Failed' );
      cb( null, 'Warning ' + cmd + ' - Failed so either way it is unmounted' );
    } else {
      log.debug( cmd + ' - Done' );
      cb( null, cmd + ' - Done' );
    }
  });
}

// Before attempting a mount perform an umount - start from clean state
function unmountSharedWorkDir( cb ) {

  var cmd;

  cmd = 'umount ' + localWorkDir;
  exec( cmd, function( err, stdout, stderr ) {
    if ( err !== null ) {
      log.debug( cmd + ' - Failed' );
      cb( null, 'Warning ' + cmd + ' - Failed so either way it is unmounted');
    } else {
      log.debug( cmd + ' - Done' );
      cb( null, cmd + ' - Done' );
    }
  });
}


// Check local Jde Directory is actually mounted to the remote Jde Pdf Output Queue
// It should remain mounted most of the time so issue debug notification if all okay
// but issue warning notification if mount not in place - auto recovery will activate
function checkJdeQueueMounted( cb) {

  var cmd;

  cmd = 'mountpoint ' + localJdeDir;
  exec( cmd, function( err, stdout, stderr ) {
    if ( err !== null ) {
      log.warn( cmd + ' - Failed' );  
      cb( err, cmd + ' - Failed' );
    } else {
      log.debug( cmd + ' - Done' );
      cb( null, cmd + ' - Done' );
    }
  });
}

// Check local Jde Directory is actually mounted to the remote Jde Pdf Output Queue
// It should remain mounted most of the time so issue debug notification if all okay
// but issue warning notification if mount not in place - auto recovery will activate
function checkWorkDirMounted( cb) {

  var cmd;

  cmd = 'mountpoint ' + localWorkDir;
  exec( cmd, function( err, stdout, stderr ) {
    if ( err !== null ) {
      log.warn( cmd + ' - Failed' );  
      cb( err, cmd + ' - Failed' );
    } else {
      log.debug( cmd + ' - Done' );  
      cb( null, cmd + ' - Done' );
    }
  });
}




