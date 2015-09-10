// pdfmonitor.js
//
// Description		: Monitor the JDE output queue and whenever a change (new report) is detected trigger 
//			: further processing checks to handle logo images on select reports.
// Author		: Paul Green
// Dated		: 2015-09-03
//
// Synopsis
// --------
// This program starts when the container starts and constantly monitors the JDE PDF output queue for change.
// This program replaces most of the old style shell monitor program as use of sshfs is too heavy on cpu 
// resource on the AIX enterprise server due to encryption overhead.
// When a change is detected control is passed to the pdfhandler which performs further checks to see if 
// any logo related processing is required.
// This process uses date from last processed PDF file entry in the Audit Log file to keep the checking 
// query light and when a change is detected that triggers further processing. 


var oracledb = require( "oracledb" ),
    logger = require( "./common/logger" ),
    audit = require( "./common/audit.js" ),
    lock = require( "./common/lock.js" ),
    mounts = require( "./common/mounts.js" ),
    async = require( "async" ),
    exec = require( "child_process" ).exec,
    credentials = { user: process.env.DB_USER, password: process.env.DB_PWD, connectString: process.env.DB_NAME },
    pollInterval = 3000,
    serverTimeOffset = 5,
    hostname = process.env.HOSTNAME,
    previousPdf = "",
    numRows = 1,
    dirRemoteJdePdf = process.env.DIR_JDEPDF,
    dirLocalJdePdf = process.env.DIR_SHAREDDATA;


// Docker container Hostname is used for Audit logging and lock file control so if not available 
// there is a problem.
if ( typeof( hostname ) === "undefined" || hostname === "" ) {
    logger.error( "pdfmonitor.js needs environment variable Hostname to be defined" );
    logger.error( "This should always be available in docker containers - something is wrong - Aborting!" );
    process.exit( 1 );
} else {
    logger.debug( "Docker Container Hostname is : " + hostname );
}


// Announce that this Pdf handler process has just started up - recorded in custom Jde Audit Log table
logger.info( "---------- START MONITORING PDF QUEUE -----------" );
audit.createAuditEntry( 'pdfmonitor', 'pdfstartup.js', hostname, 'Start Monitoring' );

// Get Oracle DB connection to re-use then make initial call to the recursive monitoring function
// this function will act on any new Jde Pdf files and once done will sleep and repeat 
oracledb.getConnection( credentials, function( err , connection ) {

    if (err) {
        logger.error( "Oracle DB Connection Failure" );
        return;
    }

    // Only interested in processing PDF files that have appeared in the PrintQueue since last run of this process
    // This query grabs the last date from Audit Log first as starting point for processing
    recursiveMonitor( connection );

});




// FUNCTIONS
//
// Recursive monitoring process repeatedly checks the Jde Job Control table for those report types flagged as requiring a Dlink logo
// When it detects that 1 or more new eligible Pdf files have been created it applies the logo image to each page.
// Once all identified Pdf files are processed this monitoring process sleeps for a short time then checks again
function recursiveMonitor( connection ) {

    var begin;

    begin  = new Date();
    logger.debug( "Checking initiated : " + begin );

    queryJdeAuditlog( connection, begin );
};


// Need date and time of last processed PDF file by this program as starting point for this process run  
function queryJdeAuditlog( connection, begin ) {
    
    var query;

    query  = "SELECT paupmj, paupmt, pasawlatm FROM testdta.F559859 WHERE PAFNDFUF2 <> 'pdfmonitor' ORDER BY pasawlatm DESC";

    connection.execute( query, [], { resultSet: true }, function( err, result ) {
        if ( err ) {
            logger.error( err.message )
        };

        processResultsFromF559859( connection, result.resultSet, numRows, audit, begin );	
    }); 
}


// Process results from JDE Audit Log table Query but only interested in last Pdf job processed
// to determine date and time which is used to control further queries
function processResultsFromF559859( connection, rsF559859, numRows, audit, begin ) {

    var record;

    rsF559859.getRows( numRows, function( err, rows ) {
        if ( err ) { 

            oracleResultsetClose( connection, rsF559859 );

      	} else if ( rows.length == 0 ) {

            queryJdeJobControl( connection, null, begin );
            oracleResultsetClose( connection, rsF559859 );

	} else if ( rows.length > 0 ) {
		
            // Last audit entry retrieved
            // Process continues by querying the JDE Job Control Master file for eligible PDF's to process

            record = rows[ 0 ];
            queryJdeJobControl( connection, record, begin );
            oracleResultsetClose( connection, rsF559859 );
	}
    });
}


// Query the JDE Job Control Master file to fetch all PDF files generated since last audit entry
// Only select PDF jobs that are registered for post PDF processing e.g. R5542565 Invoice Print
function queryJdeJobControl( connection, record, begin ) {

    var auditTimestamp,
        query,
        result,
        jdeDate,
        jdeTime,
        jdeDateToday,
        firstRecord = true;

    logger.debug( record );

    // Normally query JDE job control file from last Pdf file processed by this process, however, firt time and if
    // if JDE Audit Log file is cleared there will be no entry so use current Date and Time instead
    if ( record === null ) {
        auditTimestamp = audit.createTimestamp();
    } else {
        auditTimestamp = record[ 2 ];
    }


    // Issue with server clocks JDE and Linux being slightly out - approx 2.5 minutes.
    // This will be rectified but in case it happens again or times drift slightly in future 
    // Adjust query search date and time backwards by Offset - say 5 minutes - to allow for slightly different clock times
    // and to ensure a PDF completing on JDE when this query runs is still included
    result = audit.adjustTimestampByMinutes( auditTimestamp, - serverTimeOffset );
    jdeDate = result.jdeDate;
    jdeTime = result.jdeTime;
    
    // Get todays date in JDE Julian format
    jdeDateToday = audit.getJdeJulianDate();

    // This job normally runs every few seconds so usually we want to query job control records for today and since time 
    // of last processed PDF file (adjusted by server time offset)
    // However, if running after midnight or no PDF files generated for a couple of days then we should not include
    // time in query as it might potentially exclude some PDF entries on different days that we need to process.

    if ( jdeDateToday === jdeDate ) {
       
        query = "SELECT jcfndfuf2, jcactdate, jcacttime, jcprocessid FROM testdta.F556110 ";
        query += " WHERE jcjobsts = 'D' AND jcfuno = 'UBE' AND jcactdate >= ";
        query += jdeDate + ' AND jcacttime >= ' + jdeTime;
        query += " AND RTRIM( SUBSTR(jcfndfuf2, 0, (INSTR(jcfndfuf2, '_') - 1)), ' ') in ( SELECT RTRIM(crpgm, ' ') FROM testdta.F559890 WHERE crcfgsid = 'PDFHANDLER') ";
        query += " ORDER BY jcactdate, jcacttime";
    	
	logger.debug( 'Last entry was today : ' + jdeDateToday + ' see: ' + jdeDate);
    } else { 
       
         query = "SELECT jcfndfuf2, jcactdate, jcacttime, jcprocessid FROM testdta.F556110 ";
        query += " WHERE jcjobsts = 'D' AND jcfuno = 'UBE' AND jcactdate >= ";
        query += jdeDate;
        query += " AND RTRIM( SUBSTR(jcfndfuf2, 0, (INSTR(jcfndfuf2, '_') - 1)), ' ') in ( SELECT RTRIM(crpgm, ' ') FROM testdta.F559890 WHERE crcfgsid = 'PDFHANDLER') ";
        query += " ORDER BY jcactdate, jcacttime";
    	
	logger.debug( 'Last entry was Not today : ' + jdeDateToday + ' see: ' + jdeDate);
    }

    logger.debug(result);
    logger.debug(query);

    connection.execute( query, [], { resultSet: true }, function( err, result ) {
        if ( err ) { 
          logger.error( err.message )
        };

        processResultsFromF556110( connection, result.resultSet, numRows, audit, begin, firstRecord );

    }); 
}


// Process results of query on JDE Job Control file 
function processResultsFromF556110( connection, rsF556110, numRows, audit, begin, firstRecord ) {

    var jobControlRecord,
        finish;

    rsF556110.getRows( numRows, function( err, rows ) {
        if ( err ) { 
            oracleResultsetClose( connection, rsF556110 );
            logger.debug("rsF556110 Error");
	
        } else if ( rows.length == 0 ) {
            oracleResultsetClose( connection, rsF556110 );

            finish = new Date();
            logger.info( "Check completed by : " + finish + " took " + ( finish - begin ) + " milliseconds" );

            // Sleep briefly then repeat check monitor indefinitely at polling interval
            setTimeout( function() { recursiveMonitor( connection, logger, credentials ) } , pollInterval );

        } else if ( rows.length > 0 ) {

            jobControlRecord = rows[ 0 ];

	    // Process PDF entry
            processPdfEntry( connection, rsF556110, begin, jobControlRecord, firstRecord );            

        }
    }); 
}

// Called to handle processing of first and subsequent 'new' PDF Entries detected in JDE Output Queue  
function processPdfEntry( connection, rsF556110, begin, jobControlRecord, firstRecord ) {

  var cb = null,
    currentPdf;

  logger.debug('processPdfEntry for : ' + jobControlRecord);
  logger.debug('processPdfEntry First? : ' + firstRecord);
 

  if ( firstRecord ) {

    firstRecord = false;
    currentPdf = jobControlRecord[ 0 ];

    // If latest JDE Pdf job name does not match the previous one we have a change so check and process in detail 
    if ( previousPdf !== currentPdf ) {

      logger.debug(" Previous PDF file : " + previousPdf);
      logger.debug(" Latest PDF file : " + currentPdf);
      previousPdf = currentPdf;

      logger.info( " ");
      logger.info( "          >>>>  CHANGE detected in JDE Output Queue <<<<");
      logger.info( " ");

      // Before processing recently noticed PDF file(s) first check mount points and re-establish if necessary
      cb = function() { lock.gainExclusivity( jobControlRecord, hostname, connection, processLockedPdfFile ); };      
      mounts.checkRemoteMounts( cb );
    }           
  } else {

    // Process second and subsequent records.
    lock.gainExclusivity( jobControlRecord, hostname, connection, processLockedPdfFile );		
  }

  // Process subsequent PDF entries if any - Read next Job Control record
  processResultsFromF556110( connection, rsF556110, numRows, audit, begin, firstRecord );

}


// Called when exclusive lock has been successfully placed to process the PDF file
function processLockedPdfFile(connection, record) 
{

    var query,
        countRec,
        count,
        cb = null;

    logger.info( 'JDE PDF ' + record[ 0 ] + " - Lock established" );

    // Check this PDF file has definitely not yet been processed by any other pdfHandler instance
    // that may be running concurrently

    query = "SELECT COUNT(*) FROM testdta.F559859 WHERE pafndfuf2 = '";
    query += record[0] + "'";

    connection.execute( query, [], { }, function( err, result ) {
        if ( err ) { 
            logger.debug( err.message );
            return;
        };

        countRec = result.rows[ 0 ];
        count = countRec[ 0 ];
        if ( count > 0 ) {
            logger.info( 'JDE PDF ' + record[ 0 ] + " - Already Processed - Releasing Lock." );
            lock.removeLock( record, hostname );
        } else {
             logger.info( 'JDE PDF ' + record[0] + ' - Processing Started' );

             // This PDF file has not yet been processed and we have the lock so process it now.
             // Note: Lock will be removed if all process steps complete or if there is an error
             // Last process step creates an audit entry which prevents file being re-processed by future runs 
             // so if error and lock removed - no audit entry therefore file will be re-processed by future run (recovery)	
             
             processPDF( record ); 

        }
    }); 
}


// Exclusive use / lock of PDF file established so free to process the file here.
function processPDF( record ) {

    var jcfndfuf2 = record[ 0 ],
        jcactdate = record[ 1 ],
        jcacttime = record[ 2 ],
        jcprocessid = record[ 3 ],
        genkey = jcactdate + " " + jcacttime,
        parms = null;

    // Make parameters available to any function in series
    parms = { "jcfndfuf2": jcfndfuf2, "record": record, "genkey": genkey, "hostname": hostname };

    async.series([
        function ( cb ) { passParms( parms, cb ) }, 
        function ( cb ) { copyJdePdfToWorkDir( parms, cb ) }, 
        function ( cb ) { applyLogo( parms, cb ) }, 
        function ( cb ) { replaceJdePdfWithLogoVersion( parms, cb ) },
        function ( cb ) { createAuditEntry( parms, cb ) }
        ], function(err, results) {

             var prms = results[ 0 ];

             // Lose lock regardless whether PDF file proceesed correctly or not
             removeLock( prms );

             // log results of Pdf processing
             if ( err ) {
               logger.error("JDE PDF " + prms.jcfndfuf2 + " - Processing failed - check logs in ./logs");
	     } else {
               logger.info("JDE PDF " + prms.jcfndfuf2 + " - Processing Complete");
             }
           }
    );
}


// Ensure required parameters for releasing lock are available in final async function
// Need to release lock if PDF file processed okay or failed with errors so it can be picked up and recovered by future runs!
// For example sshfs connection to remote directories on AIX might go down and re-establish later
function passParms(parms, cb) {

  logger.debug( 'passParms' + ' : ' + parms );
  cb( null, parms);  

}


// Make a backup copy of the original JDE PDF file - just in case we need the untouched original
// These can be purged inline with the normal JDE PrintQueue - currently PDF's older than approx 2 months
function copyJdePdfToWorkDir( parms, cb ) {

    var cmd = "cp /home/pdfdata/" + parms.jcfndfuf2 + " /home/shareddata/wrkdir/" + parms.jcfndfuf2.trim() + "_ORIGINAL";

    logger.verbose( "JDE PDF " + parms.jcfndfuf2 + " - Make backup copy of original JDE PDF file in work directory" );
    logger.debug( cmd );
    exec( cmd, function( err, stdout, stderr ) {
        if ( err !== null ) {
	    logger.debug( cmd + ' ERROR: ' + err );
            cb( err, cmd + " - Failed" );
        } else {
            cb( null, cmd + " - Done" );
        }
    });
}


// Read original PDF and create new replacement version in working directory with logos added
function applyLogo( parms, cb ) {

    var pdfInput = "/home/shareddata/wrkdir/" + parms.jcfndfuf2.trim() + "_ORIGINAL",
        pdfOutput = '/home/shareddata/wrkdir/' + parms.jcfndfuf2,
        cmd = "node ./src/pdfaddlogo.js " + pdfInput + " " + pdfOutput ;

    logger.verbose( "JDE PDF " + parms.jcfndfuf2 + " - Read original creating new PDF in work Directory with logos" );
    logger.debug( cmd );
    exec( cmd, function( err, stdout, stderr ) {
        if ( err !== null ) {
	    logger.debug( cmd + ' ERROR: ' + err );
            cb( err, cmd + " - Failed" );
         } else {
            cb( null, cmd + " - Done" );
         }
    });
}


// Replace original JDE PDF File in PrintQueue with amended PDF incuding logos
function replaceJdePdfWithLogoVersion( parms, cb ) {

    var pdfWithLogos = "/home/shareddata/wrkdir/" + parms.jcfndfuf2,
        jdePrintQueue = "/home/pdfdata/" + parms.jcfndfuf2,
        cmd = "mv " + pdfWithLogos + " " + jdePrintQueue;

    logger.verbose( "JDE PDF " + parms.jcfndfuf2 + " - Replace JDE output queue PDF with modified Logo version" );
    logger.debug( cmd );
    exec( cmd, function( err, stdout, stderr ) {
        if ( err !== null ) {
	    logger.debug( cmd + ' ERROR: ' + err );
            cb( err, cmd + " - Failed" );
        } else {
            cb( null, cmd + " - Done" );
        }
    });
}


function createAuditEntry( parms, cb ) {

    // Create Audit entry for this Processed record - once created it won't be processed again
    audit.createAuditEntry( parms.jcfndfuf2, parms.genkey, parms.hostname, "PROCESSED - LOGO" );
    logger.verbose( "JDE PDF " + parms.jcfndfuf2 + " - Audit Record written to JDE" );
    cb( null, "Audit record written" );
}


function removeLock( parms ) {

    lock.removeLock( parms.record, parms.hostname );
    logger.verbose( "JDE PDF " + parms.jcfndfuf2 + " - Lock Released" );
   
}


// Close Oracle database result set
function oracleResultsetClose( connection, rs ) {

    rs.close( function( err ) {
        if ( err ) {
            logger.error("Error closing resultset: " + err.message);
            oracleConnectionRelease(); 
        }
    }); 
}


// Close Oracle database connection
function oracleConnectionRelease( connection ) {

    logger.debug( "Releasing Connection" );
    connection.release( function ( err ) {
        if ( err ) {
            logger.error( "Error closing connection: " + err.message );
        }
    });
}
