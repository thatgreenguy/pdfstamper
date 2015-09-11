// pdfchecker.js  : Check Jde Job Control table looking for any recently generated Pdf files that are configured 
//                : in JDE to be eligible for logo processing and apply Dlink logo image when required.
// Author         : Paul Green
// Dated          : 2015-09-03
//
// Synopsis
// --------
//
// Called periodically by pdfhandler.js
// It checks the Jde Job Control Audit table looking for recently completed UBE reports.
// When it detects reports belonging to Invoice Print (and/or any other configured reports) it will process the resulting
// PDF file adding logo images to each page.


var oracledb = require( 'oracledb' ),
  lock = require( './common/lock.js' ),
  log = require( './common/logger.js' ),
  audit = require( './common/audit.js' ),
  async = require( 'async' ),
  exec = require( 'child_process' ).exec,
  dirRemoteJdePdf = process.env.DIR_JDEPDF,
  dirLocalJdePdf = process.env.DIR_SHAREDDATA,
  serverTimeOffset = 5,
  numRows = 1,
  begin = null;


module.exports.performJdePdfProcessing = function( dbCn, dbCredentials, pollInterval, hostname, lastPdf, performPolledProcess ) {

  begin = new Date();
  log.verbose( 'Checking started at ' + begin + ' - looking for new Jde Pdf files since last run' );

  if ( dbCn === null ) {
    log.warn( 'Oracle DB connection expected - Pass valid Oracle connection object' );
  }

  queryJdeAuditLog( dbCn, pollInterval, hostname, lastPdf, performPolledProcess ); 

} 


// - Functions
//
// Jde Audit Log records date and time of every Pdf file processed by this application.
// Fetch the last audit entry made by this process and use the date and time as starting point for next query check  
function queryJdeAuditLog( dbCn, pollInterval, hostname, lastPdf, performPolledProcess ) {

    var query;

    query  = "SELECT paupmj, paupmt, pasawlatm, pafndfuf2 FROM testdta.F559859 ";
    query += "WHERE RTRIM(PAFNDFUF2, ' ') <> 'pdfhandler' ORDER BY pasawlatm DESC";

    dbCn.execute( query, [], { resultSet: true }, function( err, rs ) {
        if ( err ) {
            log.error( err.message )
        };

        processResultsFromF559859( dbCn, rs.resultSet, numRows, begin, pollInterval, hostname, lastPdf, performPolledProcess );	
    }); 
}


// Process results from JDE Audit Log table Query but only interested in last Pdf job processed
// to determine date and time which is used to control further queries
function processResultsFromF559859( dbCn, rsF559859, numRows, begin, pollInterval, hostname, lastPdf, performPolledProcess ) {

    var record;

    rsF559859.getRows( numRows, function( err, rows ) {
        if ( err ) { 

            oracleResultsetClose( dbCn, rsF559859 );

      	} else if ( rows.length == 0 ) {

            queryJdeJobControl( dbCn, null, begin, pollInterval, hostname, lastPdf, performPolledProcess );
            oracleResultsetClose( dbCn, rsF559859 );

	} else if ( rows.length > 0 ) {
		
            // Last audit entry retrieved
            // Process continues by querying the JDE Job Control Master file for eligible PDF's to process

            record = rows[ 0 ];
            queryJdeJobControl( dbCn, record, begin, pollInterval, hostname, lastPdf, performPolledProcess );
            oracleResultsetClose( dbCn, rsF559859 );
	}
    });
}


// Query the JDE Job Control Master file to fetch all PDF files generated since last audit entry
// Only select PDF jobs that are registered for post PDF processing e.g. R5542565 Invoice Print
function queryJdeJobControl( dbCn, record, begin, pollInterval, hostname, lastPdf, performPolledProcess
 ) {

    var auditTimestamp,
        query,
        result,
        jdeDate,
        jdeTime,
        jdeDateToday,
        firstRecord;

    // New query so set first record flag to true
    firstRecord = true;

    // Normally query JDE job control file from last Pdf file processed by this process, however, firt time and if
    // if JDE Audit Log file is cleared there will be no entry so use current Date and Time instead
    if ( record === null ) {
        auditTimestamp = audit.createTimestamp();
    } else {
      // Set the Last PDF processed by this application (from the JDE Audit table)
      lastPdf = record[ 3 ];
      log.verbose( 'Last JDE Audit Record / PDF Processed was : ' + record );
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
    // of last processed PDF file (adjusted by server time offset), however, if running after midnight or no PDF files generated
    // for a couple of days then we should not include time in query as it might potentially exclude some earlier PDF entries on
    // different days that we need to process.

    if ( jdeDateToday === jdeDate ) {
       
        query = "SELECT jcfndfuf2, jcactdate, jcacttime, jcprocessid FROM testdta.F556110 ";
        query += " WHERE jcjobsts = 'D' AND jcfuno = 'UBE' AND jcactdate >= ";
        query += jdeDate + ' AND jcacttime >= ' + jdeTime;
        query += " AND RTRIM( SUBSTR(jcfndfuf2, 0, (INSTR(jcfndfuf2, '_') - 1)), ' ') in ( SELECT RTRIM(crpgm, ' ') FROM testdta.F559890 WHERE crcfgsid = 'PDFHANDLER') ";
        query += " ORDER BY jcactdate, jcacttime";
    	
	log.debug( 'Last entry was today : ' + jdeDateToday + ' see: ' + jdeDate);
    } else { 
       
         query = "SELECT jcfndfuf2, jcactdate, jcacttime, jcprocessid FROM testdta.F556110 ";
        query += " WHERE jcjobsts = 'D' AND jcfuno = 'UBE' AND jcactdate >= ";
        query += jdeDate;
        query += " AND RTRIM( SUBSTR(jcfndfuf2, 0, (INSTR(jcfndfuf2, '_') - 1)), ' ') in ( SELECT RTRIM(crpgm, ' ') FROM testdta.F559890 WHERE crcfgsid = 'PDFHANDLER') ";
        query += " ORDER BY jcactdate, jcacttime";
    	
	log.debug( 'Last entry was Not today : ' + jdeDateToday + ' see: ' + jdeDate);
    }

    log.debug(query);

    dbCn.execute( query, [], { resultSet: true }, function( err, rs ) {
        if ( err ) { 
          log.error( err.message );
          return;
        }

        processResultsFromF556110( dbCn, rs.resultSet, numRows, begin, firstRecord, pollInterval, hostname, lastPdf, performPolledProcess );
    }); 
}


// Process results of query on JDE Job Control file 
function processResultsFromF556110( dbCn, rsF556110, numRows, begin, firstRecord, pollInterval, hostname, lastPdf, performPolledProcess ) {

  var jobControlRecord,
  finish;

  rsF556110.getRows( numRows, function( err, rows ) {
    if ( err ) { 
      oracleResultsetClose( dbCn, rsF556110 );
      log.debug("rsF556110 Error");
      return;
	
    } else if ( rows.length == 0 ) {
      oracleResultsetClose( dbCn, rsF556110 );
      finish = new Date();
      log.verbose( 'Checking completed : ' + finish  + ' took ' + ( finish - begin ) + ' milliseconds' );

      // No more Job control records to process in this run - this run is done - so schedule next run
      setTimeout( performPolledProcess, pollInterval );

    } else if ( rows.length > 0 ) {


      jobControlRecord = rows[ 0 ];
      log.debug( jobControlRecord );

      // Process PDF entry
      processPdfEntry( dbCn, rsF556110, begin, jobControlRecord, firstRecord, pollInterval, hostname, lastPdf, performPolledProcess );            

    }
  }); 
}

// Called to handle processing of first and subsequent 'new' PDF Entries detected in JDE Output Queue  
function processPdfEntry( dbCn, rsF556110, begin, jobControlRecord, firstRecord, pollInterval, hostname, lastPdf, performPolledProcess ) {

  var cb = null,
    currentPdf;

  currentPdf = jobControlRecord[ 0 ];
  log.verbose('Last PDF: ' + lastPdf + ' currentPdf: ' + currentPdf );

  // If latest JDE Pdf job name does not match the previous one we have a change so check and process in detail 
  if ( lastPdf !== currentPdf ) {

    log.debug(" Last PDF: " + lastPdf + ' Current one: ' + currentPdf );
    log.info( "          >>>>  CHANGE detected in JDE Output Queue <<<<");

    // Before processing recently noticed PDF file(s) first check mount points and re-establish if necessary
    var cb = function() { processLockedPdfFile( dbCn, jobControlRecord, hostname ); }
    lock.gainExclusivity( jobControlRecord, hostname, dbCn, cb );
      
  }           

/*  if ( firstRecord ) {

    firstRecord = false;
    currentPdf = jobControlRecord[ 0 ];

    log.verbose('First Record: ' + firstRecord + ' processPdfEntry: ' + jobControlRecord );
    // If latest JDE Pdf job name does not match the previous one we have a change so check and process in detail 
    if ( lastPdf !== currentPdf ) {

      log.debug(" Last PDF file : " + lastPdf);
      log.debug(" Latest PDF file : " + currentPdf);
//      log.info( " ");
//      log.info( "          >>>>  CHANGE detected in JDE Output Queue <<<<");
//      log.info( " ");

      // Before processing recently noticed PDF file(s) first check mount points and re-establish if necessary
      var cb = function() { processLockedPdfFile( dbCn, jobControlRecord, audit, log, hostname ); }
      lock.gainExclusivity( jobControlRecord, hostname, dbCn, cb );
      
    }           

  } else {

    // Process second and subsequent records.
    var cb = function() { processLockedPdfFile( dbCn, jobControlRecord, audit, log, hostname ); }
    lock.gainExclusivity( jobControlRecord, hostname, dbCn, cb );		
  }
*/

  // Process subsequent PDF entries if any - Read next Job Control record
  processResultsFromF556110( dbCn, rsF556110, numRows, begin, firstRecord, pollInterval, hostname, lastPdf, performPolledProcess );

}


// Called when exclusive lock has been successfully placed to process the PDF file
function processLockedPdfFile(dbCn, record, hostname ) {

    var query,
        countRec,
        count,
        cb = null;

    log.info( 'JDE PDF ' + record[ 0 ] + " - Lock established" );

    // Check this PDF file has definitely not yet been processed by any other pdfHandler instance
    // that may be running concurrently

    query = "SELECT COUNT(*) FROM testdta.F559859 WHERE pafndfuf2 = '";
    query += record[0] + "'";

    dbCn.execute( query, [], { }, function( err, result ) {
        if ( err ) { 
            log.debug( err.message );
            return;
        };

        countRec = result.rows[ 0 ];
        count = countRec[ 0 ];
        if ( count > 0 ) {
            log.info( 'JDE PDF ' + record[ 0 ] + " - Already Processed - Releasing Lock." );
            lock.removeLock( record, hostname );

        } else {
             log.info( 'JDE PDF ' + record[0] + ' - Processing Started' );

             // This PDF file has not yet been processed and we have the lock so process it now.
             // Note: Lock will be removed if all process steps complete or if there is an error
             // Last process step creates an audit entry which prevents file being re-processed by future runs 
             // so if error and lock removed - no audit entry therefore file will be re-processed by future run (recovery)	
             
             processPDF( record, hostname ); 

        }
    }); 
}


// Exclusive use / lock of PDF file established so free to process the file here.
function processPDF( record, hostname ) {

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
//        function ( cb ) { replaceJdePdfWithLogoVersion( parms, cb ) },
        function ( cb ) { createAuditEntry( parms, cb ) }
        ], function(err, results) {

             var prms = results[ 0 ];

             // Lose lock regardless whether PDF file proceesed correctly or not
             removeLock( prms );

             // log results of Pdf processing
             if ( err ) {
               log.error("JDE PDF " + prms.jcfndfuf2 + " - Processing failed - check logs in ./logs");
	     } else {
               log.info("JDE PDF " + prms.jcfndfuf2 + " - Processing Complete - Logos added");
             }
           }
    );
}


// Ensure required parameters for releasing lock are available in final async function
// Need to release lock if PDF file processed okay or failed with errors so it can be picked up and recovered by future runs!
// For example sshfs dbCn to remote directories on AIX might go down and re-establish later
function passParms(parms, cb) {

  log.debug( 'passParms' + ' : ' + parms );
  cb( null, parms);  

}


// Make a backup copy of the original JDE PDF file - just in case we need the untouched original
// These can be purged inline with the normal JDE PrintQueue - currently PDF's older than approx 2 months
function copyJdePdfToWorkDir( parms, cb ) {

  var cmd = "cp /home/pdfdata/" + parms.jcfndfuf2 + " /home/shareddata/wrkdir/" + parms.jcfndfuf2.trim() + "_ORIGINAL";

  log.verbose( "JDE PDF " + parms.jcfndfuf2 + " - Make backup copy of original JDE PDF file in work directory" );
  log.debug( cmd );
  exec( cmd, function( err, stdout, stderr ) {
    if ( err !== null ) {
      log.debug( cmd + ' ERROR: ' + err );
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

  log.verbose( "JDE PDF " + parms.jcfndfuf2 + " - Read original creating new PDF in work Directory with logos" );
  log.debug( cmd );
  exec( cmd, function( err, stdout, stderr ) {
    if ( err !== null ) {
      log.debug( cmd + ' ERROR: ' + err );
      log.info( 'Errors when applying Logo: Check but likely due to Logo already applied in prior run: ');
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

  log.verbose( "JDE PDF " + parms.jcfndfuf2 + " - Replace JDE output queue PDF with modified Logo version" );
  log.debug( cmd );
  exec( cmd, function( err, stdout, stderr ) {
    if ( err !== null ) {
      log.debug( cmd + ' ERROR: ' + err );
      cb( err, cmd + " - Failed" );
    } else {
      cb( null, cmd + " - Done" );
    }
  });
}


function createAuditEntry( parms, cb ) {

  // Create Audit entry for this Processed record - once created it won't be processed again
  audit.createAuditEntry( parms.jcfndfuf2, parms.genkey, parms.hostname, "PROCESSED - LOGO" );
  log.verbose( "JDE PDF " + parms.jcfndfuf2 + " - Audit Record written to JDE" );
  cb( null, "Audit record written" );
}


function removeLock( parms ) {

  lock.removeLock( parms.record, parms.hostname );
  log.verbose( "JDE PDF " + parms.jcfndfuf2 + " - Lock Released" );
   
}


// Close Oracle database result set
function oracleResultsetClose( dbCn, rs ) {

  rs.close( function( err ) {
    if ( err ) {
      log.error( "Error closing dbCn: " + err.message );
      oracledbCnRelease(); 
    }
  }); 
}


// Close Oracle database dbCn
function oracledbCnRelease( dbCn ) {

  dbCn.release( function ( err ) {
    if ( err ) {
      log.error( "Error closing dbCn: " + err.message );
    }
  });
}
